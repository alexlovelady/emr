import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Athelas RCM parity item 3: multiple payment methods (card/ACH/cash/check — not just card via
 * `NoopPaymentGateway`) and payment plans (a schedule of installments paid down over time).
 *
 * No async job queue/scheduler exists anywhere in this codebase (see the plan file's Phase I scope
 * note), so there is no auto-charge-on-a-timer here — an installment is marked paid only by an
 * explicit action (staff records it, or in a later phase a patient pays it themselves), same
 * "honestly scoped, not silently faked" posture as every other stubbed vendor boundary.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('ledger_entries')
    .addColumn('payment_method', 'text')
    .addColumn('payment_reference', 'text')
    .execute();
  await db.schema
    .alterTable('ledger_entries')
    .addCheckConstraint('ledger_entries_payment_method_check', sql`payment_method is null or payment_method in ('card', 'ach', 'cash', 'check')`)
    .execute();

  await withCommonColumns(db.schema.createTable('payment_plans'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('total_amount', 'numeric', (col) => col.notNull())
    .addColumn('installment_amount', 'numeric', (col) => col.notNull())
    .addColumn('installment_count', 'integer', (col) => col.notNull())
    .addColumn('frequency', 'text', (col) => col.notNull())
    .addColumn('start_date', 'date', (col) => col.notNull())
    .addForeignKeyConstraint('payment_plans_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('payment_plans_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint('payment_plans_frequency_check', sql`frequency in ('weekly', 'biweekly', 'monthly')`)
    .addCheckConstraint('payment_plans_status_check', sql`status in ('active', 'completed', 'cancelled')`)
    .execute();
  await sql`create index payment_plans_tenant_idx on payment_plans (tenant_id)`.execute(db);
  await sql`create index payment_plans_patient_idx on payment_plans (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'payment_plans');

  await withCommonColumns(db.schema.createTable('payment_plan_installments'))
    .addColumn('payment_plan_id', 'uuid', (col) => col.notNull())
    .addColumn('sequence_number', 'integer', (col) => col.notNull())
    .addColumn('due_date', 'date', (col) => col.notNull())
    .addColumn('amount', 'numeric', (col) => col.notNull())
    .addColumn('paid_ledger_entry_id', 'uuid', (col) => col.references('ledger_entries.id'))
    .addForeignKeyConstraint('payment_plan_installments_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('payment_plan_installments_plan_fk', ['payment_plan_id'], 'payment_plans', ['id'])
    .addUniqueConstraint('payment_plan_installments_plan_sequence_unique', ['payment_plan_id', 'sequence_number'])
    .addCheckConstraint('payment_plan_installments_status_check', sql`status in ('pending', 'paid', 'missed', 'cancelled')`)
    .execute();
  await sql`create index payment_plan_installments_tenant_idx on payment_plan_installments (tenant_id)`.execute(db);
  await sql`create index payment_plan_installments_plan_idx on payment_plan_installments (payment_plan_id)`.execute(db);
  await enableTenantIsolation(db, 'payment_plan_installments');

  await db.schema
    .alterTable('ledger_entries')
    .addColumn('payment_plan_installment_id', 'uuid', (col) => col.references('payment_plan_installments.id'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ledger_entries').dropColumn('payment_plan_installment_id').execute();
  await db.schema.dropTable('payment_plan_installments').ifExists().execute();
  await db.schema.dropTable('payment_plans').ifExists().execute();
  await db.schema.alterTable('ledger_entries').dropConstraint('ledger_entries_payment_method_check').execute();
  await db.schema.alterTable('ledger_entries').dropColumn('payment_method').dropColumn('payment_reference').execute();
}
