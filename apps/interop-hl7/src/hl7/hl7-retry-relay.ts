import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { withTenantContext } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { Hl7ParseError, Hl7PermanentProcessingError } from '@ehr/hl7';
import { Hl7MessageRepository, type Hl7MessageRow } from './hl7-message.repository.js';

export interface Hl7RetryRelayOptions {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  backoffBaseMs: number;
}

/** The one method the relay actually needs from `Hl7IngestionService` — a real instance always
 * satisfies this structurally; kept as its own interface so tests can supply a fake reprocessor
 * (deterministically throwing/succeeding) instead of driving real HL7 parsing + domain writes to
 * exercise the retry/backoff/dead-letter bookkeeping. */
export interface Hl7Reprocessor {
  reprocess(trx: Kysely<DB> | Transaction<DB>, ctx: RequestContext, messageTypeKey: string, rawMessage: string): Promise<void>;
}

/**
 * Item 15 of the post-Tier-2 gap sweep: HL7 ingestion had idempotent redelivery but no
 * dead-letter-queue/retry-scheduling mechanism — a message that failed for a transient reason
 * (see `Hl7PermanentProcessingError`/`Hl7ParseError`'s doc comments for the permanent/transient
 * split) just sat `status='failed'` forever, with the sending interface's own redelivery the only
 * way it could ever be retried, and that redelivery path (`Hl7IngestionService.ingest()`'s
 * idempotency check) never actually reprocesses — it just replays the stored outcome.
 *
 * Shaped exactly like `packages/outbox`'s `OutboxRelay`: `start()`/`stop()` around a `setInterval`,
 * a `running` re-entrancy guard, a public `tick()` for tests/manual triggering. `db` must be an
 * owner/bootstrap-role connection (same justification as `OutboxRelay`'s own doc comment) —
 * `Hl7MessageRepository.claimDueRetries()` polls `hl7_messages` across every tenant in one query,
 * which `ehr_app`'s RLS would otherwise silently return nothing for. The actual reprocessing of a
 * claimed row, however, runs through `withTenantContext` on that SAME connection, scoped to that
 * row's own tenant — the owner role bypasses RLS but the request-context/permission semantics
 * every domain service expects (an explicit `tenantId`, not an ambient assumption) are unaffected
 * either way.
 *
 * At-least-once, same caveat `OutboxRelay` documents: `claimDueRetries`'s SELECT and each row's
 * subsequent processing aren't combined into one row-locking statement, so two concurrent
 * `interop-hl7` replicas each running their own relay could in principle both claim the same due
 * row. `Hl7IngestionService.reprocess()`'s own dispatch methods are the same ones `ingest()` uses,
 * which aren't all guaranteed idempotent on a genuine double-apply (unlike `ingest()`'s own
 * control-id check) — acceptable for now since this mirrors an existing, accepted limitation
 * elsewhere in this codebase, not a new one introduced here.
 */
export class Hl7RetryRelay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly ingestionService: Hl7Reprocessor,
    private readonly messageRepo: Hl7MessageRepository,
    private readonly options: Hl7RetryRelayOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        console.error('[Hl7RetryRelay] tick failed, will retry next interval:', err);
      });
    }, this.options.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Processes one batch of due rows. Exposed directly for tests and manual triggering. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.messageRepo.claimDueRetries(this.db, this.options.batchSize);
      for (const row of due) {
        await this.retryOne(row);
      }
      return due.length;
    } finally {
      this.running = false;
    }
  }

  private async retryOne(row: Hl7MessageRow): Promise<void> {
    try {
      await withTenantContext(this.db, row.tenantId, (trx) =>
        this.ingestionService.reprocess(
          trx,
          { tenantId: row.tenantId, requestId: randomUUID(), correlationId: randomUUID() },
          row.messageType,
          row.rawMessage,
        ),
      );
      await withTenantContext(this.db, row.tenantId, (trx) => this.messageRepo.markProcessed(trx, row.tenantId, row.id, row.tenantId));
    } catch (err) {
      const retryable = isRetryableFailure(err);
      const detail = err instanceof Error ? err.message : String(err);
      await withTenantContext(this.db, row.tenantId, (trx) =>
        this.messageRepo.recordRetryFailure(trx, row.tenantId, row.id, detail, {
          retryable,
          maxAttempts: this.options.maxAttempts,
          backoffBaseMs: this.options.backoffBaseMs,
        }),
      );
      console.error(`[Hl7RetryRelay] retry failed for message ${row.id} (tenant ${row.tenantId}):`, err);
    }
  }
}

/** Same classification `Hl7IngestionService`'s own private `isRetryableFailure` uses for the
 * synchronous ingest path — duplicated rather than exported from that module, since both sides
 * import the same two error classes directly rather than sharing an implementation-detail helper. */
function isRetryableFailure(err: unknown): boolean {
  return !(err instanceof Hl7ParseError || err instanceof Hl7PermanentProcessingError);
}
