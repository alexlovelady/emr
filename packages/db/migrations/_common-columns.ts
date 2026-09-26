/* eslint-disable @typescript-eslint/no-explicit-any --
   Migrations use Kysely<any> (Kysely's own recommended pattern, since DDL builders don't carry
   useful column-level types) — packages/db/src/types.ts is the strongly-typed schema application
   code actually checks against. */
import { sql, type CreateTableBuilder } from 'kysely';

/**
 * Appends the EHR_BUILD_SPEC.md §5.1 common columns to a `createTable` builder.
 */
export function withCommonColumns(
  builder: CreateTableBuilder<any, any>,
  opts: { tenantScoped: boolean } = { tenantScoped: true },
): CreateTableBuilder<any, any> {
  let b = builder;
  if (opts.tenantScoped) {
    b = b.addColumn('tenant_id', 'uuid', (col) => col.notNull());
  }
  return b
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('version', 'bigint', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_by', 'uuid')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_by', 'uuid')
    .addColumn('recorded_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('source_type', 'text', (col) => col.notNull().defaultTo('user_entered'))
    .addColumn('source_system', 'text')
    .addColumn('source_id', 'text')
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`));
}

/**
 * Enables Postgres Row-Level Security on `tableName` and adds the standard tenant_isolation
 * policy (spec §18.2 / rule #3). `force` also applies RLS to the table owner (it never applies
 * to a superuser regardless) — defense in depth in case a query is ever run as the owner role by
 * mistake; the application itself must always connect as `ehr_app`, never the owner.
 */
export async function enableTenantIsolation(db: import('kysely').Kysely<any>, tableName: string): Promise<void> {
  await sql`alter table ${sql.ref(tableName)} enable row level security`.execute(db);
  await sql`alter table ${sql.ref(tableName)} force row level security`.execute(db);
  await sql`
    create policy tenant_isolation on ${sql.ref(tableName)}
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid)
  `.execute(db);
}
