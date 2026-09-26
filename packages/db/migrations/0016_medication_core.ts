import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * The patient's medication list + reconciliation events per EHR_BUILD_SPEC.md §5.5, scoped to
 * what Phase 3 owns: distinguishing patient-reported vs. clinician-entered medications and
 * recording that a reconciliation pass happened. Actual e-prescribing/pharmacy transmission is
 * explicitly Phase 5 ("eRx integration") — `medications` here is a list, not an order pipeline.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('medications'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid')
    .addColumn('medication_name', 'text', (col) => col.notNull())
    .addColumn('rxnorm_code', 'text')
    .addColumn('dose', 'text')
    .addColumn('route', 'text')
    .addColumn('frequency', 'text')
    .addColumn('entry_source', 'text', (col) => col.notNull())
    .addColumn('started_at', 'date')
    .addColumn('stopped_at', 'date')
    .addColumn('prescriber_id', 'uuid')
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('medications_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('medications_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('medications_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addCheckConstraint(
      'medications_entry_source_check',
      sql`entry_source in ('patient_reported', 'clinician_entered', 'external_import')`,
    )
    .execute();
  await sql`create index medications_tenant_idx on medications (tenant_id)`.execute(db);
  await sql`create index medications_patient_idx on medications (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'medications');

  await withCommonColumns(db.schema.createTable('medication_reconciliation_events'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('performed_by', 'uuid', (col) => col.notNull())
    .addColumn('performed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('medication_reconciliation_events_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('medication_reconciliation_events_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('medication_reconciliation_events_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .execute();
  await sql`create index medication_reconciliation_events_tenant_idx on medication_reconciliation_events (tenant_id)`.execute(
    db,
  );
  await sql`create index medication_reconciliation_events_patient_idx on medication_reconciliation_events (patient_id)`.execute(
    db,
  );
  await enableTenantIsolation(db, 'medication_reconciliation_events');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('medication_reconciliation_events').ifExists().execute();
  await db.schema.dropTable('medications').ifExists().execute();
}
