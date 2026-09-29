import type { Kysely, Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from '@ehr/db';
import { withTenantContext } from '@ehr/db';
import { Hl7PermanentProcessingError } from '@ehr/hl7';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { Hl7MessageRepository } from './hl7-message.repository.js';
import { Hl7RetryRelay, type Hl7Reprocessor } from './hl7-retry-relay.js';

/** Throws a fixed error for its first `failTimes` calls, then resolves — deterministic stand-in
 * for "the downstream write kept failing, then the transient condition cleared." */
class ScriptedReprocessor implements Hl7Reprocessor {
  callCount = 0;

  constructor(
    private readonly failTimes: number,
    private readonly errorFactory: () => Error = () => new Error('simulated transient failure'),
  ) {}

  async reprocess(_trx: Kysely<DB> | Transaction<DB>, _ctx: unknown, _messageTypeKey: string, _rawMessage: string): Promise<void> {
    this.callCount += 1;
    if (this.callCount <= this.failTimes) throw this.errorFactory();
  }
}

const OPTIONS = { pollIntervalMs: 999_999, batchSize: 10, maxAttempts: 3, backoffBaseMs: 1000 };

describe('Hl7RetryRelay', () => {
  let handle: TestDbHandle;
  const messageRepo = new Hl7MessageRepository();

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  /** Inserts a message row already in the exact state `claimDueRetries` looks for: `status=
   * 'failed'`, not dead-lettered, due in the past (a negative backoff puts `next_retry_at` before
   * now immediately, so the test never has to sleep). */
  async function insertDueFailedMessage(retryCount: number): Promise<{ id: string; tenantId: string }> {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const controlId = `RETRY-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const stored = await messageRepo.create(trx, {
        tenantId: ctxA.tenantId,
        messageControlId: controlId,
        messageType: 'ORU^R01',
        rawMessage: 'irrelevant-for-this-test',
        createdBy: ctxA.actor?.id ?? ctxA.tenantId,
      });
      for (let i = 0; i < retryCount; i++) {
        await messageRepo.recordRetryFailure(trx, ctxA.tenantId, stored.id, 'prior attempt failed', {
          retryable: true,
          maxAttempts: 100, // never exhaust here — this loop is only building up retryCount
          backoffBaseMs: 1,
        });
      }
      // Force the row due right now regardless of what the loop above scheduled.
      await messageRepo.markFailed(trx, ctxA.tenantId, stored.id, 'due now', ctxA.tenantId, { retryable: true, backoffMs: -1000 });
      return { id: stored.id, tenantId: ctxA.tenantId };
    });
  }

  it('reprocesses a due message successfully and marks it processed, clearing the retry schedule', async () => {
    const { id, tenantId } = await insertDueFailedMessage(0);
    const reprocessor = new ScriptedReprocessor(0);
    const relay = new Hl7RetryRelay(handle.ownerDb, reprocessor, messageRepo, OPTIONS);

    const claimed = await relay.tick();
    expect(claimed).toBeGreaterThanOrEqual(1);
    expect(reprocessor.callCount).toBeGreaterThanOrEqual(1);

    const row = await withTenantContext(handle.db, tenantId, (trx) => messageRepo.findById(trx, tenantId, id));
    expect(row?.status).toBe('processed');
    expect(row?.deadLetter).toBe(false);
    expect(row?.nextRetryAt).toBeNull();
  });

  it('reschedules a retryable failure that has not yet exhausted maxAttempts', async () => {
    const { id, tenantId } = await insertDueFailedMessage(0);
    const reprocessor = new ScriptedReprocessor(1); // fails once more, still retryable
    const relay = new Hl7RetryRelay(handle.ownerDb, reprocessor, messageRepo, OPTIONS);

    await relay.tick();

    const row = await withTenantContext(handle.db, tenantId, (trx) => messageRepo.findById(trx, tenantId, id));
    expect(row?.status).toBe('failed');
    expect(row?.deadLetter).toBe(false);
    expect(row?.retryCount).toBe(2); // 1 from insertDueFailedMessage's markFailed, +1 from this attempt
    expect(row?.nextRetryAt).not.toBeNull();
    expect(row!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters a retryable failure once maxAttempts is exhausted', async () => {
    // Already at maxAttempts - 1 retries; one more failure must exhaust it.
    const { id, tenantId } = await insertDueFailedMessage(OPTIONS.maxAttempts - 1);
    const reprocessor = new ScriptedReprocessor(1);
    const relay = new Hl7RetryRelay(handle.ownerDb, reprocessor, messageRepo, OPTIONS);

    await relay.tick();

    const row = await withTenantContext(handle.db, tenantId, (trx) => messageRepo.findById(trx, tenantId, id));
    expect(row?.status).toBe('failed');
    expect(row?.deadLetter).toBe(true);
    expect(row?.nextRetryAt).toBeNull();
  });

  it('dead-letters immediately on a permanent-classified failure, regardless of maxAttempts', async () => {
    const { id, tenantId } = await insertDueFailedMessage(0);
    const reprocessor = new ScriptedReprocessor(1, () => new Hl7PermanentProcessingError('no longer fixable by retrying'));
    const relay = new Hl7RetryRelay(handle.ownerDb, reprocessor, messageRepo, OPTIONS);

    await relay.tick();

    const row = await withTenantContext(handle.db, tenantId, (trx) => messageRepo.findById(trx, tenantId, id));
    expect(row?.status).toBe('failed');
    expect(row?.deadLetter).toBe(true);
    expect(row?.nextRetryAt).toBeNull();
    expect(row?.parseError).toBe('no longer fixable by retrying');
  });

  it('does not claim a dead-lettered row or one not yet due', async () => {
    const dueButDeadLettered = await insertDueFailedMessage(0);
    await withTenantContext(handle.db, dueButDeadLettered.tenantId, (trx) =>
      messageRepo.recordRetryFailure(trx, dueButDeadLettered.tenantId, dueButDeadLettered.id, 'already dead', {
        retryable: false,
        maxAttempts: 1,
        backoffBaseMs: 1,
      }),
    );

    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const notYetDue = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const stored = await messageRepo.create(trx, {
        tenantId: ctxA.tenantId,
        messageControlId: `RETRY-FUTURE-${Date.now()}`,
        messageType: 'ORU^R01',
        rawMessage: 'irrelevant',
        createdBy: ctxA.tenantId,
      });
      await messageRepo.markFailed(trx, ctxA.tenantId, stored.id, 'scheduled for later', ctxA.tenantId, {
        retryable: true,
        backoffMs: 3_600_000,
      });
      return stored.id;
    });

    const reprocessor = new ScriptedReprocessor(0);
    const relay = new Hl7RetryRelay(handle.ownerDb, reprocessor, messageRepo, OPTIONS);
    await relay.tick();

    // Assert on these two specific rows rather than a global call count — claimDueRetries polls
    // across every tenant in the shared dev database, so an unrelated due row from another test
    // file would make a strict "nothing at all was claimed" assertion flaky.
    const deadLetteredRow = await withTenantContext(handle.db, dueButDeadLettered.tenantId, (trx) =>
      messageRepo.findById(trx, dueButDeadLettered.tenantId, dueButDeadLettered.id),
    );
    expect(deadLetteredRow?.status).toBe('failed'); // unchanged — never claimed

    const futureRow = await withTenantContext(handle.db, ctxA.tenantId, (trx) => messageRepo.findById(trx, ctxA.tenantId, notYetDue));
    expect(futureRow?.status).toBe('failed'); // unchanged — never claimed
  });
});
