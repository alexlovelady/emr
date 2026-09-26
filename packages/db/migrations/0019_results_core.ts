import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * DiagnosticReport per EHR_BUILD_SPEC.md §5.2/§5.6. `order_id` is nullable — most reports
 * originate from a placed order, but a clinician can also transcribe an outside result that never
 * went through our ordering flow; `encounter_id` stays required (a report always needs a clinical
 * context to be reviewed/signed against, same reasoning as Note in Phase 3).
 *
 * Individual result values reuse Phase 3's `observations` table (`category: 'laboratory'`) rather
 * than a parallel table — this migration just adds the two nullable link columns it needs
 * (`order_id`, `specimen_id`) to correlate a lab value back to what produced it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('diagnostic_reports'))
    .addColumn('order_id', 'uuid')
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('code_system', 'text')
    .addColumn('code', 'text')
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('conclusion', 'text')
    .addColumn('performing_lab', 'text')
    .addColumn('issued_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('critical_flag', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('abnormal_flag', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('review_status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by', 'uuid')
    .addColumn('amends_report_id', 'uuid')
    .addForeignKeyConstraint('diagnostic_reports_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('diagnostic_reports_order_fk', ['order_id'], 'orders', ['id'])
    .addForeignKeyConstraint('diagnostic_reports_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('diagnostic_reports_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('diagnostic_reports_amends_fk', ['amends_report_id'], 'diagnostic_reports', ['id'])
    .addCheckConstraint(
      'diagnostic_reports_review_status_check',
      sql`review_status in ('pending', 'reviewed', 'acknowledged')`,
    )
    .execute();
  await sql`create index diagnostic_reports_tenant_idx on diagnostic_reports (tenant_id)`.execute(db);
  await sql`create index diagnostic_reports_patient_idx on diagnostic_reports (patient_id)`.execute(db);
  await sql`create index diagnostic_reports_order_idx on diagnostic_reports (order_id)`.execute(db);
  await sql`
    create index diagnostic_reports_pending_review_idx on diagnostic_reports (tenant_id, issued_at)
      where review_status = 'pending'
  `.execute(db);
  await enableTenantIsolation(db, 'diagnostic_reports');

  await db.schema
    .alterTable('observations')
    .addColumn('order_id', 'uuid', (col) => col.references('orders.id'))
    .addColumn('specimen_id', 'uuid', (col) => col.references('specimens.id'))
    .execute();
  await sql`create index observations_order_idx on observations (order_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('observations').dropColumn('order_id').dropColumn('specimen_id').execute();
  await db.schema.dropTable('diagnostic_reports').ifExists().execute();
}
