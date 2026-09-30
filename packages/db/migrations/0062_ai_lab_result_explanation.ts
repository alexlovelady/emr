import { Kysely, sql } from 'kysely';

/**
 * Epic-parity item 3 (patient-facing AI, "Emmie" equivalent, reframed responsibly): an AI-drafted,
 * plain-language explanation of a released lab result — staff-reviewed and explicitly accepted
 * before a patient ever sees it in the portal, same propose->review pipeline every other AI
 * feature uses (no live LLM vendor is connected — `NoopAiGateway` stubs this exactly like the
 * other 8 features). Widens `ai_generations.feature`'s allowlist (same pattern migration 0042
 * used for `appeal_draft`) and adds `linked_diagnostic_report_id`, mirroring the existing
 * `linked_cohort_execution_id` column's precedent for tying a generation back to the domain object
 * it's about — set directly at propose time here (unlike the cohort-execution case, the report
 * already exists before the generation does, so no follow-up write is needed).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_generations').dropConstraint('ai_generations_feature_check').execute();
  await db.schema
    .alterTable('ai_generations')
    .addCheckConstraint(
      'ai_generations_feature_check',
      sql`feature in (
        'ambient_note_draft', 'encounter_summary', 'chart_qa', 'message_draft',
        'coding_suggestion', 'denial_summary', 'appeal_draft', 'task_summary', 'nl_to_cohort_dsl',
        'lab_result_explanation'
      )`,
    )
    .execute();

  await db.schema.alterTable('ai_generations').addColumn('linked_diagnostic_report_id', 'uuid').execute();
  await db.schema
    .alterTable('ai_generations')
    .addForeignKeyConstraint('ai_generations_diagnostic_report_fk', ['linked_diagnostic_report_id'], 'diagnostic_reports', ['id'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_generations').dropConstraint('ai_generations_diagnostic_report_fk').execute();
  await db.schema.alterTable('ai_generations').dropColumn('linked_diagnostic_report_id').execute();

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
