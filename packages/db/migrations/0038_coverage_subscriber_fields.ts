import { Kysely, sql } from 'kysely';

/**
 * Athelas-parity RCM scrubbing pass: real claim scrubbers need to detect a "subscriber mismatch"
 * (the patient isn't always the policyholder — e.g. a dependent child on a parent's plan), but
 * `coverages` had no subscriber concept at all — every coverage was implicitly "patient is the
 * subscriber." `subscriber_relationship` defaults to `'self'` (the common case, and every existing
 * row's true state) so this is a non-breaking additive column, matching the pattern
 * `allergies.code_system`/`.code` (migration 0036) already used for the same reason.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('coverages')
    .addColumn('subscriber_relationship', 'text', (col) => col.notNull().defaultTo('self'))
    .addColumn('subscriber_name', 'text')
    .execute();
  await db.schema
    .alterTable('coverages')
    .addCheckConstraint('coverages_subscriber_relationship_check', sql`subscriber_relationship in ('self', 'spouse', 'child', 'other')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('coverages').dropConstraint('coverages_subscriber_relationship_check').execute();
  await db.schema.alterTable('coverages').dropColumn('subscriber_relationship').dropColumn('subscriber_name').execute();
}
