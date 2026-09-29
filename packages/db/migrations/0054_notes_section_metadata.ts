import { Kysely, sql } from 'kysely';

/**
 * Item 19's "stale copied-forward-note tracking" sub-gap: `notes.content` (a flat
 * section-key -> text-blob map) had no way to tell which sections were ever actually reviewed by
 * the signing clinician versus carried over untouched from a template default or a prior note's
 * `amend()`/copy-forward. `section_metadata` is a parallel map, same keys as `content`, each value
 * `{source: 'template_default'|'copied_forward'|'edited', copiedFromNoteId?, lastTouchedAt}` — see
 * `domains/clinical/src/note/note.service.ts`'s doc comments for exactly how/when each field
 * transitions.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('notes')
    .addColumn('section_metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('notes').dropColumn('section_metadata').execute();
}
