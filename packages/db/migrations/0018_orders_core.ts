import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * ServiceRequest + Specimen per EHR_BUILD_SPEC.md §5.2's order chain
 * (`ServiceRequest -> Specimen -> Observation -> DiagnosticReport`). Unlike Problem/Allergy
 * (patient-level, spec §5.2), an order is encounter-scoped like Observation/Procedure — placing
 * an order is something a practitioner does during a specific visit, and (practically) an
 * incoming HL7 result needs to inherit a concrete encounter from the order it correlates to
 * (see migration 0020's doc comment on how that correlation works).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('orders'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('ordering_practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('order_type', 'text', (col) => col.notNull())
    .addColumn('code_system', 'text')
    .addColumn('code', 'text')
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('routine'))
    .addColumn('ordered_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('orders_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('orders_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('orders_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('orders_practitioner_fk', ['ordering_practitioner_id'], 'practitioners', ['id'])
    .addCheckConstraint('orders_priority_check', sql`priority in ('routine', 'urgent', 'stat')`)
    .execute();
  await sql`create index orders_tenant_idx on orders (tenant_id)`.execute(db);
  await sql`create index orders_patient_idx on orders (patient_id)`.execute(db);
  await sql`create index orders_encounter_idx on orders (encounter_id)`.execute(db);
  await enableTenantIsolation(db, 'orders');

  await withCommonColumns(db.schema.createTable('specimens'))
    .addColumn('order_id', 'uuid', (col) => col.notNull())
    .addColumn('specimen_type', 'text', (col) => col.notNull())
    .addColumn('accession_number', 'text')
    .addColumn('collected_at', 'timestamptz')
    .addForeignKeyConstraint('specimens_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('specimens_order_fk', ['order_id'], 'orders', ['id'])
    .execute();
  await sql`create index specimens_tenant_idx on specimens (tenant_id)`.execute(db);
  await sql`create index specimens_order_idx on specimens (order_id)`.execute(db);
  await enableTenantIsolation(db, 'specimens');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('specimens').ifExists().execute();
  await db.schema.dropTable('orders').ifExists().execute();
}
