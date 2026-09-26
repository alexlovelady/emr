import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Secure messaging (EHR_BUILD_SPEC.md §17). One resource, two authenticated-caller shapes —
 * `sender_type`/`created_by_type` distinguish a staff user from a portal account without needing
 * two parallel tables. `sender_id` is a plain uuid (a `users.id` or a `portal_accounts.id`
 * depending on `sender_type`) rather than two nullable FK columns, since exactly one of those two
 * tables is ever the real referent and enforcing that via a DB-level FK would need a
 * type-conditional constraint Postgres doesn't support cleanly — the application layer (
 * `@ehr/messaging`) is the source of truth here, the same trust boundary already used for
 * `ledger_entries.claim_id`-style optional cross-references elsewhere.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('message_threads'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('subject', 'text', (col) => col.notNull())
    .addColumn('created_by_type', 'text', (col) => col.notNull())
    .addColumn('last_message_at', 'timestamptz')
    .addForeignKeyConstraint('message_threads_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('message_threads_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint('message_threads_created_by_type_check', sql`created_by_type in ('staff', 'portal')`)
    .execute();
  await sql`create index message_threads_tenant_idx on message_threads (tenant_id)`.execute(db);
  await sql`create index message_threads_patient_idx on message_threads (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'message_threads');

  await withCommonColumns(db.schema.createTable('messages'))
    .addColumn('thread_id', 'uuid', (col) => col.notNull())
    .addColumn('sender_type', 'text', (col) => col.notNull())
    .addColumn('sender_id', 'uuid', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('read_at', 'timestamptz')
    .addForeignKeyConstraint('messages_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('messages_thread_fk', ['thread_id'], 'message_threads', ['id'])
    .addCheckConstraint('messages_sender_type_check', sql`sender_type in ('staff', 'portal')`)
    .execute();
  await sql`create index messages_tenant_idx on messages (tenant_id)`.execute(db);
  await sql`create index messages_thread_idx on messages (thread_id)`.execute(db);
  await enableTenantIsolation(db, 'messages');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('messages').ifExists().execute();
  await db.schema.dropTable('message_threads').ifExists().execute();
}
