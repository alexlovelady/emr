import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { OrganizationRepository } from '../organization/organization.repository.js';
import type { CreateLocationInput, UpdateLocationInput } from './location.dto.js';
import { LocationRepository, type LocationRow } from './location.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class LocationService {
  constructor(
    private readonly repo: LocationRepository = new LocationRepository(),
    private readonly organizationRepo: OrganizationRepository = new OrganizationRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateLocationInput): Promise<LocationRow> {
    const org = await this.organizationRepo.findById(trx, ctx.tenantId, input.organizationId);
    if (!org) throw new NotFoundError('Organization not found', { organizationId: input.organizationId });

    const actorId = ctx.actor?.id ?? null;
    const location = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      organizationId: input.organizationId,
      name: input.name,
      timeZone: input.timeZone ?? 'America/New_York',
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'location.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'location',
          aggregate_id: location.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { name: location.name, organizationId: location.organizationId },
        }),
      )
      .execute();

    return location;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<LocationRow> {
    const location = await this.repo.findById(trx, ctx.tenantId, id);
    if (!location) throw new NotFoundError('Location not found', { id });
    return location;
  }

  async list(trx: Executor, ctx: RequestContext, pagination: { limit?: number | undefined; offset?: number | undefined } = {}): Promise<LocationRow[]> {
    return this.repo.list(trx, ctx.tenantId, pagination);
  }

  async update(trx: Executor, ctx: RequestContext, id: string, input: UpdateLocationInput): Promise<LocationRow> {
    await this.getById(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    return this.repo.update(trx, ctx.tenantId, id, { ...input, updatedBy: actorId ?? ctx.tenantId });
  }

  async deactivate(trx: Executor, ctx: RequestContext, id: string): Promise<LocationRow> {
    const location = await this.getById(trx, ctx, id);
    if (location.status !== 'active') {
      throw new ConflictError('Location is not active', { id, status: location.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, id, 'inactive', actorId ?? ctx.tenantId);
    await this.revokeActivePractitionerRoles(trx, ctx, id, actorId);
    return updated;
  }

  /**
   * A deactivated location must not keep silently granting access through a stale
   * practitioner-role assignment. `@ehr/workforce` (which owns `practitioner_roles`) already
   * depends on `@ehr/tenant` for `LocationRepository` — importing it back here would be a package
   * cycle, so this queries the table directly with raw Kysely, same reasoning as
   * `PrescriptionService.checkInteractions()`'s direct `allergies` query in `@ehr/medication`.
   */
  private async revokeActivePractitionerRoles(trx: Executor, ctx: RequestContext, locationId: string, actorId: string | null): Promise<void> {
    const active = await trx
      .selectFrom('practitioner_roles')
      .select(['id', 'practitioner_id as practitionerId', 'version'])
      .where('tenant_id', '=', ctx.tenantId)
      .where('location_id', '=', locationId)
      .where('status', '=', 'active')
      .execute();

    for (const assignment of active) {
      await trx
        .updateTable('practitioner_roles')
        .set({ status: 'revoked', effective_end: new Date(), updated_by: actorId ?? ctx.tenantId, updated_at: new Date() })
        .where('tenant_id', '=', ctx.tenantId)
        .where('id', '=', assignment.id)
        .execute();

      await trx
        .insertInto('outbox_events')
        .values(
          buildOutboxInsert({
            event_type: 'practitioner_role.revoked.v1',
            tenant_id: ctx.tenantId,
            aggregate_type: 'practitioner_role',
            aggregate_id: assignment.id,
            aggregate_version: Number(assignment.version) + 1,
            actor_id: actorId,
            correlation_id: ctx.correlationId,
            causation_id: null,
            data: { practitionerId: assignment.practitionerId, locationId, reason: 'location_deactivated' },
          }),
        )
        .execute();
    }
  }

  async listNames(trx: Executor, ctx: RequestContext, ids: string[]): Promise<{ id: string; name: string }[]> {
    return this.repo.listNamesByIds(trx, ctx.tenantId, ids);
  }
}
