import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Records-download requests (EHR_BUILD_SPEC.md §17's "record export request"). Fulfilled
 * synchronously — no async job queue exists (same reasoning as Phase 4's FHIR bulk-export
 * deferral) — so `status` moves straight from `pending` to `completed`/`failed` within the same
 * request; this table exists mainly as the durable receipt + the `storage_key` pointer, not as a
 * work queue for a background worker to drain.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('export_requests'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('requested_by_portal_account_id', 'uuid', (col) => col.notNull())
    .addColumn('storage_key', 'text')
    .addForeignKeyConstraint('export_requests_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('export_requests_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('export_requests_account_fk', ['requested_by_portal_account_id'], 'portal_accounts', ['id'])
    .execute();
  await sql`create index export_requests_tenant_idx on export_requests (tenant_id)`.execute(db);
  await sql`create index export_requests_patient_idx on export_requests (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'export_requests');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('export_requests').ifExists().execute();
}
