import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Remittance + patient ledger + eligibility, completing EHR_BUILD_SPEC.md §5.2's chain
 * (`... -> Claim -> ClaimVersion -> Remittance -> LedgerEntry`). `ledger_entries` is a simple,
 * append-only signed-amount ledger (charges positive, payments/adjustments negative) — the running
 * balance is computed by `domains/payments`, not cached on a column, to avoid a second value that
 * could drift out of sync with the entries themselves.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('remittances'))
    .addColumn('claim_id', 'uuid', (col) => col.notNull())
    .addColumn('claim_version_id', 'uuid', (col) => col.notNull())
    .addColumn('payer_paid_amount', 'numeric', (col) => col.notNull())
    .addColumn('adjustment_amount', 'numeric', (col) => col.notNull().defaultTo(0))
    .addColumn('patient_responsibility_amount', 'numeric', (col) => col.notNull().defaultTo(0))
    .addColumn('remittance_advice_number', 'text')
    .addColumn('raw_payload', 'jsonb', (col) => col.notNull())
    .addColumn('posted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('remittances_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('remittances_claim_fk', ['claim_id'], 'claims', ['id'])
    .addForeignKeyConstraint('remittances_claim_version_fk', ['claim_version_id'], 'claim_versions', ['id'])
    .execute();
  await sql`create index remittances_tenant_idx on remittances (tenant_id)`.execute(db);
  await sql`create index remittances_claim_idx on remittances (claim_id)`.execute(db);
  await enableTenantIsolation(db, 'remittances');

  await withCommonColumns(db.schema.createTable('ledger_entries'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('claim_id', 'uuid')
    .addColumn('entry_type', 'text', (col) => col.notNull())
    .addColumn('amount', 'numeric', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('ledger_entries_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('ledger_entries_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('ledger_entries_claim_fk', ['claim_id'], 'claims', ['id'])
    .addCheckConstraint(
      'ledger_entries_entry_type_check',
      sql`entry_type in ('charge', 'payment', 'adjustment', 'patient_payment')`,
    )
    .execute();
  await sql`create index ledger_entries_tenant_idx on ledger_entries (tenant_id)`.execute(db);
  await sql`create index ledger_entries_patient_idx on ledger_entries (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'ledger_entries');

  await withCommonColumns(db.schema.createTable('eligibility_checks'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('coverage_id', 'uuid', (col) => col.notNull())
    .addColumn('is_eligible', 'boolean', (col) => col.notNull())
    .addColumn('copay_amount', 'numeric')
    .addColumn('deductible_remaining', 'numeric')
    .addColumn('raw_response', 'jsonb', (col) => col.notNull())
    .addColumn('checked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('eligibility_checks_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('eligibility_checks_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('eligibility_checks_coverage_fk', ['coverage_id'], 'coverages', ['id'])
    .execute();
  await sql`create index eligibility_checks_tenant_idx on eligibility_checks (tenant_id)`.execute(db);
  await sql`create index eligibility_checks_patient_idx on eligibility_checks (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'eligibility_checks');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('eligibility_checks').ifExists().execute();
  await db.schema.dropTable('ledger_entries').ifExists().execute();
  await db.schema.dropTable('remittances').ifExists().execute();
}
