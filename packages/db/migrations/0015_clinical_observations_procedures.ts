import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Observation (vitals) + Procedure per EHR_BUILD_SPEC.md §5.2 — both hang off `Encounter` in the
 * spec's aggregate diagram (`Encounter -> Note / Diagnosis / Observation / Procedure / Charge`),
 * so `encounter_id` is required here (unlike Problem/Allergy). `observations` is modeled
 * generically (code/display_name/value/unit/category) matching spec §8.1's FHIR Observation
 * shape, so Phase 4's lab results can reuse this same table with `category: 'laboratory'` instead
 * of a second parallel table.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('observations'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('category', 'text', (col) => col.notNull().defaultTo('vital-signs'))
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('value_quantity', 'numeric')
    .addColumn('value_text', 'text')
    .addColumn('unit', 'text')
    .addColumn('effective_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('observations_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('observations_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('observations_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .execute();
  await sql`create index observations_tenant_idx on observations (tenant_id)`.execute(db);
  await sql`create index observations_encounter_idx on observations (encounter_id)`.execute(db);
  await enableTenantIsolation(db, 'observations');

  await withCommonColumns(db.schema.createTable('procedures'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('code_system', 'text')
    .addColumn('code', 'text')
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('performed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('procedures_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('procedures_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('procedures_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .execute();
  await sql`create index procedures_tenant_idx on procedures (tenant_id)`.execute(db);
  await sql`create index procedures_encounter_idx on procedures (encounter_id)`.execute(db);
  await enableTenantIsolation(db, 'procedures');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('procedures').ifExists().execute();
  await db.schema.dropTable('observations').ifExists().execute();
}
