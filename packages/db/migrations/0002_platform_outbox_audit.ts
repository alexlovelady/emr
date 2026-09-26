import { Kysely, sql } from 'kysely';
import { enableTenantIsolation } from './_common-columns.js';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('outbox_events')
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('aggregate_type', 'text', (col) => col.notNull())
    .addColumn('aggregate_id', 'uuid', (col) => col.notNull())
    .addColumn('aggregate_version', 'bigint', (col) => col.notNull())
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .addColumn('actor_id', 'uuid')
    .addColumn('correlation_id', 'uuid', (col) => col.notNull())
    .addColumn('causation_id', 'uuid')
    .addColumn('data', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('published_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    create index outbox_events_pending_idx on outbox_events (created_at)
    where status = 'pending'
  `.execute(db);

  await enableTenantIsolation(db, 'outbox_events');

  await db.schema
    .createTable('audit_events')
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
    .addColumn('event_id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .addColumn('actor_type', 'text', (col) => col.notNull())
    .addColumn('actor_id', 'uuid')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('resource_id', 'uuid')
    .addColumn('patient_id', 'uuid')
    .addColumn('purpose', 'text')
    .addColumn('request_id', 'uuid', (col) => col.notNull())
    .addColumn('ip', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('outcome', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`create index audit_events_tenant_occurred_idx on audit_events (tenant_id, occurred_at)`.execute(
    db,
  );

  await enableTenantIsolation(db, 'audit_events');

  // Append-only at the grant level: audit_events must never be editable/deletable by the
  // application, even by a bug (spec §7.1: "Forward logs to an append-only/tamper-evident
  // store with restricted deletion"). ehr_app got broad DML via migration 0001's default
  // privileges; explicitly claw back update/delete on this one table.
  await sql`revoke update, delete on audit_events from ehr_app`.execute(db).catch((err: unknown) => {
    console.warn(
      '[migration 0002_platform_outbox_audit] Could not revoke update/delete from ehr_app on ' +
        `audit_events (ehr_app role may not exist yet — see migration 0001). Error: ${String(err)}`,
    );
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('audit_events').ifExists().execute();
  await db.schema.dropTable('outbox_events').ifExists().execute();
}
