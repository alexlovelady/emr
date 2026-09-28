import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Athelas RCM parity item 5: bank reconciliation. No live bank-feed API is integrated (a real one
 * would be its own vendor boundary, same as clearinghouse/lab/eRx) — this is file-based, matching
 * how most practices actually reconcile today: download a BAI2 statement export from the bank's own
 * portal, upload it here. `@ehr/bai2` parses the file; this table stores one row per BAI2
 * transaction-detail (`16`) record, then a matching pass links each to a `remittances` row.
 *
 * Idempotent re-import only works when the bank actually supplies a `bank_reference_number`
 * (common, but not universal) — the partial unique index below is scoped to non-null references for
 * exactly that reason; a bank that omits reference numbers can produce duplicate rows on re-upload,
 * a real, documented limitation rather than a silently-broken guarantee.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('bank_deposits'))
    .addColumn('account_number', 'text', (col) => col.notNull())
    .addColumn('bank_reference_number', 'text')
    .addColumn('transaction_date', 'date', (col) => col.notNull())
    .addColumn('amount', 'numeric', (col) => col.notNull())
    .addColumn('type_code', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('import_batch_id', 'uuid', (col) => col.notNull())
    .addColumn('matched_remittance_id', 'uuid', (col) => col.references('remittances.id'))
    .addForeignKeyConstraint('bank_deposits_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addCheckConstraint('bank_deposits_status_check', sql`status in ('unmatched', 'matched', 'ignored')`)
    .execute();
  await sql`create index bank_deposits_tenant_idx on bank_deposits (tenant_id)`.execute(db);
  await sql`create index bank_deposits_status_idx on bank_deposits (tenant_id, status)`.execute(db);
  await sql`create index bank_deposits_matched_remittance_idx on bank_deposits (matched_remittance_id)`.execute(db);
  await sql`
    create unique index bank_deposits_dedupe_idx on bank_deposits (tenant_id, account_number, bank_reference_number, transaction_date, amount)
    where bank_reference_number is not null
  `.execute(db);
  await enableTenantIsolation(db, 'bank_deposits');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('bank_deposits').ifExists().execute();
}
