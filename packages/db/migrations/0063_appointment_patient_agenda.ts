import { Kysely } from 'kysely';

/**
 * Epic-parity item 3's second piece: pre-visit agenda capture — a patient types what they want to
 * discuss before an upcoming visit, visible to staff on the schedule/encounter view. No existing
 * mechanism fit cleanly: `cancellation_reason` is semantically a different, cancel-time-only field,
 * and a generic secure-message thread has no link back to a specific appointment. A plain nullable
 * free-text column directly on `appointments` (same shape as `cancellation_reason` itself — one
 * column, one purpose) is the simplest correct fit; a separate table would only earn its keep if
 * an edit history mattered here, which it doesn't for a single pre-visit note.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('appointments')
    .addColumn('patient_agenda', 'text')
    .addColumn('patient_agenda_updated_at', 'timestamptz')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('appointments').dropColumn('patient_agenda').dropColumn('patient_agenda_updated_at').execute();
}
