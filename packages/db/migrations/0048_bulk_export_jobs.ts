import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Tier-2-adjacent platform gap: bulk FHIR `$export` (HL7 Bulk Data Access IG), deferred from Phase
 * J because it needs an async job queue this repo didn't have anywhere. This table + a new
 * `BulkExportRelay` (mirrors `OutboxRelay`'s polling shape exactly, in a new `packages/bulk-export`)
 * is that queue — scoped to system-level export only (not `Group`/`Patient`-level, a real but
 * smaller cut). `output_files` stores `{type, storageKey, count}[]`, never a URL directly — a
 * presigned download URL is minted fresh on each status-poll read (`packages/object-storage`'s
 * default presign TTL is 5 minutes, far shorter than a real export job's lifetime).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('bulk_export_jobs'))
    .addColumn('requested_by_client_id', 'text', (col) => col.notNull())
    .addColumn('resource_types', sql`text[]`)
    .addColumn('since', 'timestamptz')
    .addColumn('output_files', 'jsonb')
    .addColumn('error', 'text')
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addForeignKeyConstraint('bulk_export_jobs_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('bulk_export_jobs_client_fk', ['requested_by_client_id'], 'smart_clients', ['client_id'])
    .addCheckConstraint('bulk_export_jobs_status_check', sql`status in ('pending', 'in_progress', 'completed', 'failed')`)
    .execute();
  await sql`create index bulk_export_jobs_tenant_idx on bulk_export_jobs (tenant_id)`.execute(db);
  await sql`create index bulk_export_jobs_status_idx on bulk_export_jobs (status, created_at)`.execute(db);
  await enableTenantIsolation(db, 'bulk_export_jobs');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('bulk_export_jobs').ifExists().execute();
}
