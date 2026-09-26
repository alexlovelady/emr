import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Coverage (patient insurance, spec §5.2) and PatientMergeHistory (spec §5.3 — "no automatic
 * patient merge without configurable high-confidence rules and review" and "reversible merge
 * metadata"). Coverage lives under the patient domain, not its own top-level domain — spec §4's
 * repository layout has no `coverage/` folder, and this mirrors how organization/location both
 * live under `domains/tenant`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('coverages'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('payer_name', 'text', (col) => col.notNull())
    .addColumn('member_id', 'text', (col) => col.notNull())
    .addColumn('group_number', 'text')
    .addColumn('plan_name', 'text')
    .addColumn('coverage_type', 'text', (col) => col.notNull().defaultTo('primary'))
    .addColumn('effective_start', 'date', (col) => col.notNull())
    .addColumn('effective_end', 'date')
    .addForeignKeyConstraint('coverages_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('coverages_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint('coverages_type_check', sql`coverage_type in ('primary', 'secondary', 'tertiary')`)
    .execute();
  await sql`create index coverages_tenant_idx on coverages (tenant_id)`.execute(db);
  await sql`create index coverages_patient_idx on coverages (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'coverages');

  await withCommonColumns(db.schema.createTable('patient_merge_history'))
    .addColumn('source_patient_id', 'uuid', (col) => col.notNull())
    .addColumn('target_patient_id', 'uuid', (col) => col.notNull())
    .addColumn('merged_by', 'uuid', (col) => col.notNull())
    .addColumn('merge_reason', 'text')
    .addColumn('reversed_at', 'timestamptz')
    .addColumn('reversed_by', 'uuid')
    .addForeignKeyConstraint('patient_merge_history_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('patient_merge_history_source_fk', ['source_patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('patient_merge_history_target_fk', ['target_patient_id'], 'patients', ['id'])
    .execute();
  await sql`create index patient_merge_history_tenant_idx on patient_merge_history (tenant_id)`.execute(db);
  await sql`create index patient_merge_history_source_idx on patient_merge_history (source_patient_id)`.execute(db);
  await enableTenantIsolation(db, 'patient_merge_history');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('patient_merge_history').ifExists().execute();
  await db.schema.dropTable('coverages').ifExists().execute();
}
