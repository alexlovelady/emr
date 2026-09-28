import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Athelas RCM parity item 4: denial/appeal automation. Before this, `denials` was pure bookkeeping
 * (`DenialService.resolve()` — a free-text-notes status flip, no appeal concept at all). `appeals`
 * is the missing real entity: an appeal has its own lifecycle (draft -> submitted -> won/lost/
 * withdrawn) independent of the denial's own `open`/`appealed`/`resolved` status, and
 * `source_ai_generation_id` gives the same real traceability migration 0039 added for AI-suggested
 * charge codes — a coder can draft an appeal with AI help, but only their explicit `POST
 * /appeals` call creates one.
 *
 * No real payer appeals-submission API exists to integrate against (same "buy, not built yet"
 * boundary as every other clearinghouse-adjacent capability) — `submit()` records that a human
 * filed the appeal through whatever channel the payer actually uses (portal, fax, mail), it does
 * not itself transmit anything.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('appeals'))
    .addColumn('claim_id', 'uuid', (col) => col.notNull())
    .addColumn('denial_id', 'uuid', (col) => col.notNull())
    .addColumn('appeal_reason', 'text', (col) => col.notNull())
    .addColumn('submitted_at', 'timestamptz')
    .addColumn('decided_at', 'timestamptz')
    .addColumn('decision_notes', 'text')
    .addColumn('source_ai_generation_id', 'uuid', (col) => col.references('ai_generations.id'))
    .addForeignKeyConstraint('appeals_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('appeals_claim_fk', ['claim_id'], 'claims', ['id'])
    .addForeignKeyConstraint('appeals_denial_fk', ['denial_id'], 'denials', ['id'])
    .addCheckConstraint('appeals_status_check', sql`status in ('draft', 'submitted', 'won', 'lost', 'withdrawn')`)
    .execute();
  await sql`create index appeals_tenant_idx on appeals (tenant_id)`.execute(db);
  await sql`create index appeals_claim_idx on appeals (claim_id)`.execute(db);
  await sql`create index appeals_denial_idx on appeals (denial_id)`.execute(db);
  await enableTenantIsolation(db, 'appeals');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('appeals').ifExists().execute();
}
