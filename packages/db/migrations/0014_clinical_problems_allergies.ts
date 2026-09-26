import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Problem + Allergy per EHR_BUILD_SPEC.md §5.2 — both hang directly off `Patient` in the spec's
 * aggregate diagram (`Patient -> Problem / Allergy / Medication / Immunization`), not off
 * `Encounter`; `encounter_id` here is nullable and exists only for provenance (which visit a
 * problem/allergy was first recorded during).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('problems'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid')
    .addColumn('code_system', 'text', (col) => col.notNull())
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('clinical_status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('onset_date', 'date')
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('problems_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('problems_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('problems_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addCheckConstraint('problems_clinical_status_check', sql`clinical_status in ('active', 'resolved', 'inactive')`)
    .execute();
  await sql`create index problems_tenant_idx on problems (tenant_id)`.execute(db);
  await sql`create index problems_patient_idx on problems (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'problems');

  await withCommonColumns(db.schema.createTable('allergies'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid')
    .addColumn('substance', 'text', (col) => col.notNull())
    .addColumn('reaction', 'text')
    .addColumn('severity', 'text')
    .addColumn('onset_date', 'date')
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('allergies_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('allergies_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('allergies_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addCheckConstraint('allergies_severity_check', sql`severity is null or severity in ('mild', 'moderate', 'severe')`)
    .execute();
  await sql`create index allergies_tenant_idx on allergies (tenant_id)`.execute(db);
  await sql`create index allergies_patient_idx on allergies (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'allergies');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('allergies').ifExists().execute();
  await db.schema.dropTable('problems').ifExists().execute();
}
