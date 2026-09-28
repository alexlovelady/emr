import { existsSync } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '@ehr/db';
import { loadIcd10Cm } from '../src/load-icd10cm.js';
import { loadRxNorm } from '../src/load-rxnorm.js';

/**
 * Connects via DATABASE_URL (the bootstrap/owner role), same as `packages/db/scripts/seed.ts` —
 * `terminology_codes` has no RLS (see migration 0037), so either role would technically work, but
 * this is an operator-run one-time bulk load, not application request traffic, so it uses the
 * same trust boundary as every other seed/migration script in this repo.
 *
 * Both file paths are optional and independent — run this against whichever file(s) you actually
 * have. Re-running against a newer release re-upserts rows in place (see each loader's own doc
 * comment), so this is always safe to re-run.
 *
 *   ICD10CM_ORDER_FILE=/path/to/icd10cm_order_2027.txt \
 *   RXNORM_RRF_FILE=/path/to/RXNCONSO.RRF \
 *   pnpm --filter @ehr/terminology run seed
 */
async function main(): Promise<void> {
  const ownerConnectionString = process.env.DATABASE_URL;
  if (!ownerConnectionString) {
    throw new Error('DATABASE_URL is required to run the terminology seed script (see .env.example).');
  }

  const icd10cmFile = process.env.ICD10CM_ORDER_FILE;
  const rxnormFile = process.env.RXNORM_RRF_FILE;
  if (!icd10cmFile && !rxnormFile) {
    throw new Error(
      'Set ICD10CM_ORDER_FILE and/or RXNORM_RRF_FILE to the downloaded flat file(s) — see packages/terminology/README.md.',
    );
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: ownerConnectionString }) }),
  });

  try {
    if (icd10cmFile) {
      if (!existsSync(icd10cmFile)) {
        console.warn(`[seed:terminology] ICD10CM_ORDER_FILE (${icd10cmFile}) does not exist — skipping ICD-10-CM.`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[seed:terminology] loading ICD-10-CM from ${icd10cmFile}...`);
        const { loaded } = await loadIcd10Cm(db, icd10cmFile);
        // eslint-disable-next-line no-console
        console.log(`[seed:terminology] ICD-10-CM: ${loaded} rows loaded.`);
      }
    } else {
      console.warn('[seed:terminology] ICD10CM_ORDER_FILE not set — skipping ICD-10-CM.');
    }

    if (rxnormFile) {
      if (!existsSync(rxnormFile)) {
        console.warn(`[seed:terminology] RXNORM_RRF_FILE (${rxnormFile}) does not exist — skipping RxNorm.`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[seed:terminology] loading RxNorm from ${rxnormFile}...`);
        const { loaded } = await loadRxNorm(db, rxnormFile);
        // eslint-disable-next-line no-console
        console.log(`[seed:terminology] RxNorm: ${loaded} rows loaded.`);
      }
    } else {
      console.warn('[seed:terminology] RXNORM_RRF_FILE not set — skipping RxNorm.');
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[seed:terminology] failed:', err);
  process.exit(1);
});
