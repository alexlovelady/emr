import { Kysely, sql } from 'kysely';
import { enableTenantIsolation } from './_common-columns.js';

/**
 * Backs apps/api's IdempotencyInterceptor (spec rule #11: "All write APIs must be idempotent
 * where retries are realistic"). Keyed by the client-supplied Idempotency-Key header plus a hash
 * of the request body, scoped per tenant.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('idempotency_keys')
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('request_hash', 'text', (col) => col.notNull())
    .addColumn('response_status', 'integer', (col) => col.notNull())
    .addColumn('response_body', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('idempotency_keys_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addPrimaryKeyConstraint('idempotency_keys_pk', ['tenant_id', 'key'])
    .execute();

  await enableTenantIsolation(db, 'idempotency_keys');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('idempotency_keys').ifExists().execute();
}
