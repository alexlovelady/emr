import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Minimal document record for the Phase 1 presigned-upload flow (packages/object-storage,
 * domains/documents). This is intentionally thin — the real DocumentReference lifecycle from
 * EHR_BUILD_SPEC.md §5.4/§16 is Phase 3+; this exists to prove the authz+audit+outbox pattern
 * end to end against a real S3-compatible dependency.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('documents'))
    .addColumn('filename', 'text', (col) => col.notNull())
    .addColumn('content_type', 'text', (col) => col.notNull())
    .addColumn('size_bytes', 'bigint')
    .addColumn('storage_key', 'text', (col) => col.notNull())
    .addColumn('checksum_sha256', 'text')
    .addColumn('uploaded_by', 'uuid')
    .addForeignKeyConstraint('documents_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addUniqueConstraint('documents_storage_key_unique', ['storage_key'])
    .execute();
  await sql`create index documents_tenant_idx on documents (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'documents');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('documents').ifExists().execute();
}
