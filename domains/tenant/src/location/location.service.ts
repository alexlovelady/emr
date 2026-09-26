import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { OrganizationRepository } from '../organization/organization.repository.js';
import type { CreateLocationInput } from './location.dto.js';
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

  async list(trx: Executor, ctx: RequestContext): Promise<LocationRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }
}
