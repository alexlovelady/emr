import { Kysely, sql } from 'kysely';

/**
 * Item 18 of the post-Tier-2 gap sweep: `packages/observability` has real OpenTelemetry
 * metrics/tracing scaffolding, but `docs/pilot-readiness-checklist.md` calls out explicitly that
 * "no alerting pipeline is wired to anything." `alerts` is a global system table, not tenant data
 * — deliberately no `withCommonColumns`/RLS (same reasoning as `roles`/`backup_runs`: a rule
 * evaluates conditions across the whole platform, not one tenant's data) — `tenant_id` is an
 * optional context column for a finding that happens to be tenant-scoped (e.g. a per-tenant HL7
 * dead-letter count), not a scoping/isolation column.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('alerts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('rule_key', 'text', (col) => col.notNull())
    .addColumn('dedupe_key', 'text', (col) => col.notNull())
    .addColumn('severity', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('detail', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('open'))
    .addColumn('tenant_id', 'uuid')
    .addColumn('opened_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolved_by', 'uuid')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('alerts_severity_check', sql`severity in ('critical', 'warning', 'info')`)
    .addCheckConstraint('alerts_status_check', sql`status in ('open', 'resolved')`)
    .addForeignKeyConstraint('alerts_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();

  // Prevents a re-evaluation from spamming duplicate open alerts for the same still-firing
  // condition — a partial unique index rather than a plain unique constraint, since 'resolved'
  // rows for the same rule_key/dedupe_key must be allowed to accumulate as history (a condition
  // that resolves and later recurs opens a genuinely new alert).
  await sql`
    create unique index alerts_open_dedupe_idx on alerts (rule_key, dedupe_key)
      where status = 'open'
  `.execute(db);
  await sql`create index alerts_status_idx on alerts (status, opened_at desc)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('alerts').ifExists().execute();
}
