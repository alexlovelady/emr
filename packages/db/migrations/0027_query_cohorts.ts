import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * EHR_BUILD_SPEC.md §8.2-8.3's cohort resource: `cohorts` is the saved, named, reusable
 * definition; `cohort_executions` is one row per compiler run (the DSL is snapshotted at
 * execution time, since a saved cohort can be edited later without rewriting history) — the
 * compiler's own required "persist query ID, user, interpretation, parameters, and result
 * metadata" step (§8.3) lands here. `result_patient_ids` is capped at 5,000 entries at the
 * application layer (see domains/query's cohort-compiler.ts) — a population query returns the
 * population, not a data dump; a separate export step is the audited path to get more.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('cohorts'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('dsl_payload', 'jsonb', (col) => col.notNull())
    .addForeignKeyConstraint('cohorts_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index cohorts_tenant_idx on cohorts (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'cohorts');

  await withCommonColumns(db.schema.createTable('cohort_executions'))
    .addColumn('cohort_id', 'uuid')
    .addColumn('dsl_payload', 'jsonb', (col) => col.notNull())
    .addColumn('estimated_rows', 'integer')
    .addColumn('result_patient_ids', sql`uuid[]`, (col) => col.notNull().defaultTo(sql`'{}'::uuid[]`))
    .addColumn('result_count', 'integer', (col) => col.notNull())
    .addColumn('executed_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('export_storage_key', 'text')
    .addForeignKeyConstraint('cohort_executions_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('cohort_executions_cohort_fk', ['cohort_id'], 'cohorts', ['id'])
    .execute();
  await sql`create index cohort_executions_tenant_idx on cohort_executions (tenant_id)`.execute(db);
  await sql`create index cohort_executions_cohort_idx on cohort_executions (cohort_id)`.execute(db);
  await enableTenantIsolation(db, 'cohort_executions');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cohort_executions').ifExists().execute();
  await db.schema.dropTable('cohorts').ifExists().execute();
}
