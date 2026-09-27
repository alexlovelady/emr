import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { LocationRepository } from '@ehr/tenant';
import { PractitionerRepository } from '../practitioner/practitioner.repository.js';
import { RoleRepository } from '../role/role.repository.js';
import type { CreatePractitionerRoleInput } from './practitioner-role.dto.js';
import { PractitionerRoleRepository, type PractitionerRoleRow } from './practitioner-role.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class PractitionerRoleService {
  constructor(
    private readonly repo: PractitionerRoleRepository = new PractitionerRoleRepository(),
    private readonly practitionerRepo: PractitionerRepository = new PractitionerRepository(),
    private readonly locationRepo: LocationRepository = new LocationRepository(),
    private readonly roleRepo: RoleRepository = new RoleRepository(),
  ) {}

  async create(
    trx: Executor,
    ctx: RequestContext,
    practitionerId: string,
    input: CreatePractitionerRoleInput,
  ): Promise<PractitionerRoleRow> {
    const practitioner = await this.practitionerRepo.findById(trx, ctx.tenantId, practitionerId);
    if (!practitioner) throw new NotFoundError('Practitioner not found', { practitionerId });

    const location = await this.locationRepo.findById(trx, ctx.tenantId, input.locationId);
    if (!location) throw new NotFoundError('Location not found', { locationId: input.locationId });

    const roles = await this.roleRepo.list(trx);
    if (!roles.some((r) => r.id === input.roleId)) throw new NotFoundError('Role not found', { roleId: input.roleId });

    const actorId = ctx.actor?.id ?? null;
    const assignment = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      practitionerId,
      locationId: input.locationId,
      roleId: input.roleId,
      ...(input.effectiveStart ? { effectiveStart: input.effectiveStart } : {}),
      effectiveEnd: input.effectiveEnd ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'practitioner_role.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'practitioner_role',
          aggregate_id: assignment.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { practitionerId, locationId: input.locationId, roleId: input.roleId },
        }),
      )
      .execute();

    return assignment;
  }

  async listByPractitioner(trx: Executor, ctx: RequestContext, practitionerId: string): Promise<PractitionerRoleRow[]> {
    const practitioner = await this.practitionerRepo.findById(trx, ctx.tenantId, practitionerId);
    if (!practitioner) throw new NotFoundError('Practitioner not found', { practitionerId });
    return this.repo.listByPractitioner(trx, ctx.tenantId, practitionerId);
  }
}
