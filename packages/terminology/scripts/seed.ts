import { existsSync } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '@ehr/db';
import { loadIcd10Cm } from '../src/load-icd10cm.js';

/**
 * Only ICD-10-CM needs a one-time bulk load — RxNorm is looked up live against NLM's free RxNav
 * API at request time (see `src/rxnav-client.ts`'s doc comment for why), so there's nothing to
 * seed for it.
 *
 * Connects via DATABASE_URL (the bootstrap/owner role), same as `packages/db/scripts/seed.ts` —
 * `terminology_codes` has no RLS (see migration 0037), so either role would technically work, but
 * this is an operator-run one-time bulk load, not application request traffic, so it uses the
 * same trust boundary as every other seed/migration script in this repo. Re-running against a
 * newer release re-upserts rows in place (see `loadIcd10Cm`'s own doc comment), so this is always
 * safe to re-run.
 *
 *   ICD10CM_ORDER_FILE=/path/to/icd10cm_order_2027.txt pnpm --filter @ehr/terminology run seed
 */
async function main(): Promise<void> {
  const ownerConnectionString = process.env.DATABASE_URL;
  if (!ownerConnectionString) {
    throw new Error('DATABASE_URL is required to run the terminology seed script (see .env.example).');
  }

  const icd10cmFile = process.env.ICD10CM_ORDER_FILE;
  if (!icd10cmFile) {
    throw new Error('Set ICD10CM_ORDER_FILE to the downloaded flat file — see packages/terminology/README.md.');
  }
  if (!existsSync(icd10cmFile)) {
    throw new Error(`ICD10CM_ORDER_FILE (${icd10cmFile}) does not exist.`);
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: ownerConnectionString }) }),
  });

  try {
    // eslint-disable-next-line no-console
    console.log(`[seed:terminology] loading ICD-10-CM from ${icd10cmFile}...`);
    const { loaded } = await loadIcd10Cm(db, icd10cmFile);
    // eslint-disable-next-line no-console
    console.log(`[seed:terminology] ICD-10-CM: ${loaded} rows loaded.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[seed:terminology] failed:', err);
  process.exit(1);
});
