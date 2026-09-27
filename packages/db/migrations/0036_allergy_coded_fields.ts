import { Kysely } from 'kysely';

/**
 * Phase K (eCW/athena parity roadmap, clinical-safety plumbing): `allergies` has been pure free
 * text (`substance`) since Phase 3 — these two nullable columns let a future allergy entry carry
 * a real coded value (e.g. RxNorm for a drug allergy) without breaking any existing free-text-only
 * row. Nullable, not backfilled — unlike `problems.code_system`/`problems.code`, which are
 * required because every problem has always been coded.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('allergies').addColumn('code_system', 'text').addColumn('code', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('allergies').dropColumn('code_system').dropColumn('code').execute();
}
