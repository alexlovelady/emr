import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreatePractitionerInput } from './practitioner.dto.js';
import { PractitionerRepository, type PractitionerRow } from './practitioner.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class PractitionerService {
  constructor(private readonly repo: PractitionerRepository = new PractitionerRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreatePractitionerInput): Promise<PractitionerRow> {
    const actorId = ctx.actor?.id ?? null;
    const practitioner = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      userId: input.userId,
      organizationId: input.organizationId,
      displayName: input.displayName,
      npi: input.npi ?? null,
      taxonomyCode: input.taxonomyCode ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'practitioner.created.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'practitioner',
          aggregate_id: practitioner.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { displayName: practitioner.displayName },
        }),
      )
      .execute();

    return practitioner;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<PractitionerRow> {
    const practitioner = await this.repo.findById(trx, ctx.tenantId, id);
    if (!practitioner) throw new NotFoundError('Practitioner not found', { id });
    return practitioner;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<PractitionerRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }
}
