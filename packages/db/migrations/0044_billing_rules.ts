import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Athelas RCM parity item 7: a configurable billing rules engine. Before this, every billing
 * validation was hardcoded (`domains/claims/src/claim/scrub-claim.ts`'s sex/age checks,
 * `domains/billing/src/charge/charge.service.ts`'s state machine) — a tenant could not add its own
 * check without a code change. `rule_type` is a fixed catalog (not a free-form rule DSL/expression
 * language — the same "governed, not general-purpose" posture as `domains/query`'s
 * GOVERNED_QUERIES, chosen for the same reason: a real expression evaluator is a much bigger,
 * riskier surface than a practice's actual near-term needs call for). `parameters` is jsonb because
 * each rule_type has its own shape; the check constraint below is the only place new rule types get
 * registered.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('billing_rules'))
    .addColumn('rule_type', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('parameters', 'jsonb', (col) => col.notNull())
    .addForeignKeyConstraint('billing_rules_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addCheckConstraint(
      'billing_rules_rule_type_check',
      sql`rule_type in ('code_requires_diagnosis_prefix', 'code_forbidden_for_sex', 'code_max_units')`,
    )
    .addCheckConstraint('billing_rules_status_check', sql`status in ('active', 'inactive')`)
    .execute();
  await sql`create index billing_rules_tenant_idx on billing_rules (tenant_id)`.execute(db);
  await sql`create index billing_rules_tenant_status_idx on billing_rules (tenant_id, status)`.execute(db);
  await enableTenantIsolation(db, 'billing_rules');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('billing_rules').ifExists().execute();
}
