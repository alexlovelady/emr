import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface Hl7MessageRow {
  id: string;
  tenantId: string;
  messageControlId: string;
  messageType: string;
  rawMessage: string;
  direction: string;
  parseError: string | null;
  processedAt: Date | null;
  status: string;
  retryCount: number;
  nextRetryAt: Date | null;
  deadLetter: boolean;
  createdAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** Owned by apps/interop-hl7 alone — no other app touches `hl7_messages`, so this isn't a shared domain package. */
export class Hl7MessageRepository {
  async findByControlId(trx: Executor, tenantId: string, messageControlId: string): Promise<Hl7MessageRow | null> {
    const row = await trx
      .selectFrom('hl7_messages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('message_control_id', '=', messageControlId)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<Hl7MessageRow | null> {
    const row = await trx
      .selectFrom('hl7_messages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async create(
    trx: Executor,
    input: { tenantId: string; messageControlId: string; messageType: string; rawMessage: string; createdBy: string },
  ): Promise<Hl7MessageRow> {
    const row = await trx
      .insertInto('hl7_messages')
      .values({
        tenant_id: input.tenantId,
        message_control_id: input.messageControlId,
        message_type: input.messageType,
        raw_message: input.rawMessage,
        direction: 'inbound',
        status: 'received',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async markProcessed(trx: Executor, tenantId: string, id: string, updatedBy: string): Promise<Hl7MessageRow> {
    const row = await trx
      .updateTable('hl7_messages')
      .set({
        status: 'processed',
        processed_at: new Date(),
        next_retry_at: null,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /**
   * Records a failed processing attempt. `retryable: true` (the default classification for any
   * error that isn't `Hl7PermanentProcessingError`/`Hl7ParseError` — see `packages/hl7/src/
   * errors.ts`) schedules `next_retry_at` a `backoffMs` from now for `Hl7RetryRelay` to pick up;
   * `retryable: false` dead-letters immediately, since resending the exact same bytes later cannot
   * change a permanent correlation/validation failure. `retry_count` is bumped here on every
   * attempt (including the very first, non-retry one) so `Hl7RetryRelay`'s own retry-exhaustion
   * check (`recordRetryOutcome`) and this row's displayed attempt count always agree.
   */
  async markFailed(
    trx: Executor,
    tenantId: string,
    id: string,
    parseError: string,
    updatedBy: string,
    opts: { retryable: boolean; backoffMs?: number } = { retryable: false },
  ): Promise<Hl7MessageRow> {
    const row = await trx
      .updateTable('hl7_messages')
      .set((eb) => ({
        status: 'failed',
        parse_error: parseError,
        processed_at: new Date(),
        retry_count: eb('retry_count', '+', 1),
        next_retry_at: opts.retryable ? new Date(Date.now() + (opts.backoffMs ?? 0)) : null,
        dead_letter: !opts.retryable,
        updated_by: updatedBy,
        updated_at: new Date(),
      }))
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /**
   * Cross-tenant by design (mirrors `OutboxRelay`'s own justification for polling across every
   * tenant in one loop) — must be called with an owner/bootstrap-role connection, never `ehr_app`
   * (RLS would otherwise silently return nothing). Only ever reads; the relay reprocesses each
   * claimed row through a per-tenant `withTenantContext` connection, same as any other tenant-owned
   * write.
   */
  async claimDueRetries(trx: Executor, limit: number): Promise<Hl7MessageRow[]> {
    const rows = await trx
      .selectFrom('hl7_messages')
      .selectAll()
      .where('status', '=', 'failed')
      .where('dead_letter', '=', false)
      .where('next_retry_at', 'is not', null)
      .where('next_retry_at', '<=', new Date())
      .orderBy('next_retry_at', 'asc')
      .limit(limit)
      .execute();
    return rows.map(toRow);
  }

  /**
   * Records the outcome of a retry attempt made by `Hl7RetryRelay`. Success clears the retry
   * schedule via `markProcessed`; a further failure either reschedules (linear backoff:
   * `retryCountAfter * backoffBaseMs`) or, once `retryCountAfter >= maxAttempts`, dead-letters the
   * message for manual review — no more automatic attempts.
   */
  async recordRetryFailure(
    trx: Executor,
    tenantId: string,
    id: string,
    parseError: string,
    opts: { retryable: boolean; maxAttempts: number; backoffBaseMs: number },
  ): Promise<Hl7MessageRow> {
    const current = await this.findById(trx, tenantId, id);
    const retryCountAfter = (current?.retryCount ?? 0) + 1;
    const exhausted = !opts.retryable || retryCountAfter >= opts.maxAttempts;

    const row = await trx
      .updateTable('hl7_messages')
      .set({
        status: 'failed',
        parse_error: parseError,
        processed_at: new Date(),
        retry_count: retryCountAfter,
        next_retry_at: exhausted ? null : new Date(Date.now() + retryCountAfter * opts.backoffBaseMs),
        dead_letter: exhausted,
        // updated_by is a uuid column with no real "system" user to attribute this to — same
        // convention Hl7IngestionService.ingest() uses (ctx.actor?.id ?? ctx.tenantId) for a
        // system-driven write with no human actor.
        updated_by: tenantId,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['hl7_messages']>): Hl7MessageRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    messageControlId: dbRow.message_control_id,
    messageType: dbRow.message_type,
    rawMessage: dbRow.raw_message,
    direction: dbRow.direction,
    parseError: dbRow.parse_error,
    processedAt: dbRow.processed_at,
    status: dbRow.status,
    retryCount: dbRow.retry_count,
    nextRetryAt: dbRow.next_retry_at,
    deadLetter: dbRow.dead_letter,
    createdAt: dbRow.created_at,
  };
}
