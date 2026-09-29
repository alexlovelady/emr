import { Kysely, sql } from 'kysely';

/**
 * Adds dead-letter/retry-scheduling bookkeeping to `hl7_messages` (item 15 of the post-Tier-2 gap
 * sweep — `docs/pilot-readiness-checklist.md` explicitly called out that idempotent redelivery was
 * the only thing tested, with "no dead-letter-queue or retry-scheduling mechanism" existing
 * structurally). A transient failure (anything not classified `Hl7PermanentProcessingError`/
 * `Hl7ParseError` — see `packages/hl7/src/errors.ts`) schedules `next_retry_at` instead of giving
 * up; `apps/interop-hl7`'s new `Hl7RetryRelay` polls for due rows and reprocesses them in the
 * background. `dead_letter` is the terminal "will never be auto-retried again, a human must look
 * at this" signal — set immediately for a permanent failure, or once `retry_count` exhausts
 * `HL7_RETRY_MAX_ATTEMPTS`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('hl7_messages')
    .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('next_retry_at', 'timestamptz')
    .addColumn('dead_letter', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute();

  // The retry relay's claim query filters on exactly this shape (status='failed', dead_letter=false,
  // next_retry_at due) across every tenant in one poll — see that table's own justification for why
  // this one query runs as the owner/bootstrap role rather than a single tenant's `ehr_app` session.
  await sql`
    create index hl7_messages_retry_due_idx on hl7_messages (next_retry_at)
      where status = 'failed' and dead_letter = false and next_retry_at is not null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists hl7_messages_retry_due_idx`.execute(db);
  await db.schema
    .alterTable('hl7_messages')
    .dropColumn('retry_count')
    .dropColumn('next_retry_at')
    .dropColumn('dead_letter')
    .execute();
}
