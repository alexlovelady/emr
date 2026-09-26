import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreateOrganizationInput } from './organization.dto.js';
import { OrganizationRepository, type OrganizationRow } from './organization.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class OrganizationService {
  constructor(private readonly repo: OrganizationRepository = new OrganizationRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateOrganizationInput): Promise<OrganizationRow> {
    const actorId = ctx.actor?.id ?? null;
    const org = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      name: input.name,
      npi: input.npi ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'organization.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'organization',
          aggregate_id: org.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { name: org.name },
        }),
      )
      .execute();

    return org;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<OrganizationRow> {
    const org = await this.repo.findById(trx, ctx.tenantId, id);
    if (!org) throw new NotFoundError('Organization not found', { id });
    return org;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<OrganizationRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }
}
