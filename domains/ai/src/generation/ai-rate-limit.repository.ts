import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * Backs the per-tenant daily AI generation cap with a real, cross-instance-safe Postgres counter
 * (see packages/db/migrations/0050_ai_rate_limit_counters.ts's doc comment for why this replaced
 * an in-memory Map). One atomic upsert does the "create today's row, or bump an existing one, and
 * tell me the new total" — a separate select-then-insert/update would race under concurrent
 * requests for the same tenant on the same day.
 */
export class AiRateLimitRepository {
  async incrementAndGet(trx: Executor, tenantId: string, windowDate: string, actorId: string): Promise<number> {
    const row = await trx
      .insertInto('ai_rate_limit_counters')
      .values({
        tenant_id: tenantId,
        window_date: windowDate,
        count: 1,
        status: 'active',
        created_by: actorId,
        updated_by: actorId,
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'window_date']).doUpdateSet({
          count: sql`ai_rate_limit_counters.count + 1`,
          updated_by: actorId,
          updated_at: new Date(),
        }),
      )
      .returning('count')
      .executeTakeFirstOrThrow();
    return row.count;
  }
}
