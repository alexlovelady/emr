import { Kysely, sql } from 'kysely';

/**
 * Tier 2 platform gap: telehealth/video visits. No real video vendor exists to integrate against
 * (same "buy, not built" boundary as every other vendor-adjacent capability) — these columns hold
 * whatever a `VideoVisitGateway` returns (today, `NoopVideoVisitGateway`'s placeholder links) once an
 * appointment is booked with `visit_type = 'telehealth'`. `video_provider_visit_id` and the two join
 * URLs are only ever populated together, by `AppointmentService`, never set directly by a client.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('appointments')
    .addColumn('visit_type', 'text', (col) => col.notNull().defaultTo('in_person'))
    .addColumn('video_provider_visit_id', 'text')
    .addColumn('video_join_url_practitioner', 'text')
    .addColumn('video_join_url_patient', 'text')
    .execute();
  await db.schema
    .alterTable('appointments')
    .addCheckConstraint('appointments_visit_type_check', sql`visit_type in ('in_person', 'telehealth')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('appointments').dropConstraint('appointments_visit_type_check').execute();
  await db.schema
    .alterTable('appointments')
    .dropColumn('visit_type')
    .dropColumn('video_provider_visit_id')
    .dropColumn('video_join_url_practitioner')
    .dropColumn('video_join_url_patient')
    .execute();
}
