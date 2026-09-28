import { Kysely } from 'kysely';

/**
 * Athelas-parity pass: real-time AI coding suggestions (Phase 9's `domains/ai`'s
 * `coding-suggestion` feature) were standalone — a coder had to separately request a report and
 * manually retype whatever it suggested. This column is the actual "wiring": when a coder finalizes
 * a charge's coding using a suggestion, `source_ai_generation_id` records exactly which
 * `ai_generations` row they used — real traceability (was this code AI-suggested or entered from
 * scratch?), not just a UX convenience. Nullable — most charges will still be coded without any AI
 * assist, and that's fine.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('charges')
    .addColumn('source_ai_generation_id', 'uuid', (col) => col.references('ai_generations.id'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('charges').dropColumn('source_ai_generation_id').execute();
}
