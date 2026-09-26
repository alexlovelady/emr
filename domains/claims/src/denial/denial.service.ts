import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { ResolveDenialInput } from './denial.dto.js';
import { DenialRepository, type DenialRow } from './denial.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class DenialService {
  constructor(private readonly repo: DenialRepository = new DenialRepository()) {}

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<DenialRow> {
    const denial = await this.repo.findById(trx, ctx.tenantId, id);
    if (!denial) throw new NotFoundError('Denial not found', { id });
    return denial;
  }

  async resolve(trx: Executor, ctx: RequestContext, id: string, input: ResolveDenialInput): Promise<DenialRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'open') {
      throw new ConflictError(`Denial is already ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const resolved = await this.repo.resolve(trx, ctx.tenantId, id, input.resolutionNotes, actorId ?? ctx.tenantId);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'denial.resolved.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'denial',
          aggregate_id: resolved.id,
          aggregate_version: resolved.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: {},
        }),
      )
      .execute();

    return resolved;
  }
}
