import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Replaces `NoopAiGateway`'s in-memory `Map<tenantId, {date, count}>` daily rate cap — real under
 * a single dev process, but silently useless the moment `apps/api` runs as more than one instance
 * (each instance had its own Map, so the same tenant could burst well past the intended cap by
 * hitting different instances). One row per (tenant, day); the check-and-increment is a single
 * atomic upsert, so it stays correct under concurrent requests across any number of instances,
 * unlike a read-then-write approach. Lives in `domains/ai` (not `packages/ai-adapter`, which
 * deliberately has zero dependencies including `@ehr/db` — see that package's own doc comments) —
 * `AiGenerationService.propose()` is the single call site for every one of the 8+ Phase 9 AI
 * features, so that's where the check now lives instead of inside the vendor-gateway abstraction.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('ai_rate_limit_counters'))
    .addColumn('window_date', 'date', (col) => col.notNull())
    .addColumn('count', 'integer', (col) => col.notNull().defaultTo(0))
    .addForeignKeyConstraint('ai_rate_limit_counters_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addUniqueConstraint('ai_rate_limit_counters_tenant_window_unique', ['tenant_id', 'window_date'])
    .execute();
  await sql`create index ai_rate_limit_counters_tenant_idx on ai_rate_limit_counters (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'ai_rate_limit_counters');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ai_rate_limit_counters').ifExists().execute();
}
