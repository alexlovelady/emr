import { Kysely, sql } from 'kysely';

/**
 * A system-operational table, not tenant data — records of a scheduled full-database backup job
 * (see packages/db-backup), whole-database in scope, not a per-tenant resource. Deliberately no
 * `withCommonColumns`/RLS (same reasoning as `roles`/`role_permissions` in migration 0005: a global
 * catalog/system table has no tenant_id to scope by). Closes the "only a manually-drilled restore
 * exists" gap documented in docs/runbooks/backup-restore.md's "Known gaps" section — that runbook's
 * drill validated the restore *mechanism*; this is the missing *schedule*.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('backup_runs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('started_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('completed_at', 'timestamptz')
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('storage_key', 'text')
    .addColumn('size_bytes', 'bigint')
    .addColumn('error', 'text')
    .addCheckConstraint('backup_runs_status_check', sql`status in ('running', 'succeeded', 'failed')`)
    .execute();
  await sql`create index backup_runs_started_at_idx on backup_runs (started_at desc)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('backup_runs').ifExists().execute();
}
