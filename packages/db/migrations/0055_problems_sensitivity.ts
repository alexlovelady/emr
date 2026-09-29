import { Kysely, sql } from 'kysely';

/**
 * Item 22 layer 5 (purpose-sensitivity) plumbing: a nullable tag marking a diagnosis/problem as
 * belonging to a commonly-recognized sensitive category (behavioral health, substance use,
 * reproductive health, HIV status). This is deliberately just a TAG mechanism — it carries no
 * per-category legal rule content (e.g. real 42 CFR Part 2 handling of substance-use records is
 * genuine legal content, the same business/legal-review gate item 20's README note already
 * describes). Nothing sets this column today; every existing problem row has `sensitivity = null`,
 * so `purpose-sensitivity.layer.ts` remains a no-op for all current data until a clinician
 * explicitly tags a problem.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('problems').addColumn('sensitivity', 'text').execute();
  await sql`
    alter table problems
      add constraint problems_sensitivity_check
      check (sensitivity is null or sensitivity in ('behavioral_health', 'substance_use', 'reproductive_health', 'hiv_status', 'other'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table problems drop constraint if exists problems_sensitivity_check`.execute(db);
  await db.schema.alterTable('problems').dropColumn('sensitivity').execute();
}
