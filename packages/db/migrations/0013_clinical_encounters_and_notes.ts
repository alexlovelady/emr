import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Encounter + Note/NoteTemplate per EHR_BUILD_SPEC.md §5.2/§5.4/§11.1. An encounter always
 * originates from a checked-in appointment (spec's `Patient -> Appointment -> Encounter` arrow) —
 * `appointment_id` is unique so at most one encounter exists per appointment. `status` carries the
 * encounter-side golden-path state machine (Roomed/InProgress/Documentation/Signed/CodingReview);
 * the RCM states after that (ClaimReady, Submitted, ...) are Phase 6.
 *
 * Notes follow spec §5.4's DRAFT -> READY_FOR_REVIEW -> SIGNED -> AMENDED lifecycle. Amendment is
 * additive, not destructive: `amends_note_id` self-references the note being corrected, and the
 * original row's content/status are never mutated once signed (spec: "preserve original; no
 * destructive update").
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('encounters'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('appointment_id', 'uuid', (col) => col.notNull())
    .addColumn('location_id', 'uuid', (col) => col.notNull())
    .addColumn('practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_type', 'text', (col) => col.notNull())
    .addColumn('started_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('ended_at', 'timestamptz')
    .addColumn('chief_complaint', 'text')
    .addForeignKeyConstraint('encounters_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('encounters_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('encounters_location_fk', ['location_id'], 'locations', ['id'])
    .addForeignKeyConstraint('encounters_practitioner_fk', ['practitioner_id'], 'practitioners', ['id'])
    .addUniqueConstraint('encounters_appointment_unique', ['appointment_id'])
    .execute();
  await sql`create index encounters_tenant_idx on encounters (tenant_id)`.execute(db);
  await sql`create index encounters_patient_idx on encounters (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'encounters');

  await withCommonColumns(db.schema.createTable('note_templates'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('schema_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('sections', 'jsonb', (col) => col.notNull())
    .addForeignKeyConstraint('note_templates_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index note_templates_tenant_idx on note_templates (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'note_templates');

  await withCommonColumns(db.schema.createTable('notes'))
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('template_id', 'uuid')
    .addColumn('note_type', 'text', (col) => col.notNull())
    .addColumn('content', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('amends_note_id', 'uuid')
    .addColumn('signed_at', 'timestamptz')
    .addColumn('signed_by', 'uuid')
    .addColumn('void_reason', 'text')
    .addForeignKeyConstraint('notes_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('notes_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('notes_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('notes_template_fk', ['template_id'], 'note_templates', ['id'])
    .addForeignKeyConstraint('notes_amends_note_fk', ['amends_note_id'], 'notes', ['id'])
    .execute();
  await sql`create index notes_tenant_idx on notes (tenant_id)`.execute(db);
  await sql`create index notes_encounter_idx on notes (encounter_id)`.execute(db);
  await sql`create index notes_amends_note_idx on notes (amends_note_id)`.execute(db);
  await enableTenantIsolation(db, 'notes');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notes').ifExists().execute();
  await db.schema.dropTable('note_templates').ifExists().execute();
  await db.schema.dropTable('encounters').ifExists().execute();
}
