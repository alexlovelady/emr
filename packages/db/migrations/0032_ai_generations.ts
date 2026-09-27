import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * EHR_BUILD_SPEC.md §15: one shared table backing every Phase 9 AI feature's propose->review
 * workflow, rather than eight near-identical tables. `status` (from withCommonColumns) carries the
 * review state machine: 'pending' -> 'accepted' | 'accepted_with_edits' | 'rejected'. `subject_type`/
 * `subject_id` is a polymorphic reference with no FK (the same trust boundary already used for
 * `messages.sender_id` — Postgres can't cleanly enforce a type-conditional FK; the application layer
 * is the source of truth). `context_refs` is the §15.4 provenance object's `source_refs` array —
 * `propose()` refuses to create a row with an empty array, so ungrounded generation is structurally
 * impossible. No LLM vendor BAA exists in this environment (regulatory manual §16.1) — every row's
 * `model_provider`/`model_id`/`model_version` currently comes from `NoopAiGateway`, a deterministic
 * stub; see docs/adr/0004-deferred-ai-vendor.md.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('ai_generations'))
    .addColumn('feature', 'text', (col) => col.notNull())
    .addColumn('patient_id', 'uuid')
    .addColumn('subject_type', 'text')
    .addColumn('subject_id', 'uuid')
    .addColumn('input_text', 'text', (col) => col.notNull())
    .addColumn('context_refs', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('model_provider', 'text', (col) => col.notNull())
    .addColumn('model_id', 'text', (col) => col.notNull())
    .addColumn('model_version', 'text', (col) => col.notNull())
    .addColumn('prompt_template_version', 'text', (col) => col.notNull())
    .addColumn('output_text', 'text', (col) => col.notNull())
    .addColumn('output_json', 'jsonb')
    .addColumn('output_hash', 'text', (col) => col.notNull())
    .addColumn('generated_at', 'timestamptz', (col) => col.notNull())
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by', 'uuid')
    .addColumn('edited_output_text', 'text')
    .addColumn('linked_cohort_execution_id', 'uuid')
    .addForeignKeyConstraint('ai_generations_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('ai_generations_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint(
      'ai_generations_feature_check',
      sql`feature in (
        'ambient_note_draft', 'encounter_summary', 'chart_qa', 'message_draft',
        'coding_suggestion', 'denial_summary', 'task_summary', 'nl_to_cohort_dsl'
      )`,
    )
    .execute();
  await sql`create index ai_generations_tenant_idx on ai_generations (tenant_id)`.execute(db);
  await sql`create index ai_generations_patient_idx on ai_generations (patient_id)`.execute(db);
  await sql`create index ai_generations_feature_idx on ai_generations (feature)`.execute(db);
  await enableTenantIsolation(db, 'ai_generations');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('ai_generations').ifExists().execute();
}
