import { Kysely, sql } from 'kysely';

/**
 * "Document ingestion" (spec §26 Phase 3) reuses Phase 1's presigned-upload flow rather than a
 * new pipeline — this just adds optional clinical linkage columns so an uploaded document can be
 * tied to a patient's chart (and optionally a specific encounter).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('documents')
    .addColumn('patient_id', 'uuid', (col) => col.references('patients.id'))
    .addColumn('encounter_id', 'uuid', (col) => col.references('encounters.id'))
    .addColumn('document_category', 'text')
    .execute();
  await sql`create index documents_tenant_patient_idx on documents (tenant_id, patient_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('documents').dropColumn('patient_id').dropColumn('encounter_id').dropColumn('document_category').execute();
}
