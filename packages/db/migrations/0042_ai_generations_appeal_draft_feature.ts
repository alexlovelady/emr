import { Kysely, sql } from 'kysely';

/**
 * `ai_generations.feature`'s check constraint (migration 0032) is an explicit allowlist, not a free
 * string column — it never had `'appeal_draft'` since that feature (Athelas RCM parity item 4)
 * didn't exist yet. Widening it, not loosening it to free text, so a typo'd feature name still
 * fails loudly at the database layer.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_generations').dropConstraint('ai_generations_feature_check').execute();
  await db.schema
    .alterTable('ai_generations')
    .addCheckConstraint(
      'ai_generations_feature_check',
      sql`feature in (
        'ambient_note_draft', 'encounter_summary', 'chart_qa', 'message_draft',
        'coding_suggestion', 'denial_summary', 'appeal_draft', 'task_summary', 'nl_to_cohort_dsl'
      )`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_generations').dropConstraint('ai_generations_feature_check').execute();
  await db.schema
    .alterTable('ai_generations')
    .addCheckConstraint(
      'ai_generations_feature_check',
      sql`feature in (
        'ambient_note_draft', 'encounter_summary', 'chart_qa', 'message_draft',
        'coding_suggestion', 'denial_summary', 'task_summary', 'nl_to_cohort_dsl'
      )`,
    )
    .execute();
}
