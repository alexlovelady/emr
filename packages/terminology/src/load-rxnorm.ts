import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

export interface RxNormRecord {
  code: string;
  display: string;
}

/** Matches `CreateMedicationSchema`'s `rxnormCode` field name — there is no separate codeSystem
 * column for medications, so this is the implicit system every RxNorm row is stored under. */
export const RXNORM_SYSTEM = 'RxNorm';

/** Clinical-drug and pack term types — what a prescriber actually selects, not every RxNorm
 * concept (ingredients, brand names, dose forms, relationship rows, etc. are all excluded). */
const PRESCRIBABLE_TTY = new Set(['SCD', 'SBD', 'GPCK', 'BPCK']);

/**
 * `RXNCONSO.RRF` (part of the RxNorm full release) is UMLS's general RRF format — pipe-delimited,
 * no header row, one row per (concept, source, string) triple, every line ending in a trailing
 * `|`. Column order (0-indexed after `split('|')`), per RxNorm's own technical documentation:
 *   0 RXCUI, 1 LAT, 2 TS, 3 LUI, 4 STT, 5 SUI, 6 ISPREF, 7 RXAUI, 8 SAUI, 9 SCUI, 10 SDUI,
 *   11 SAB, 12 TTY, 13 CODE, 14 STR, 15 SRL, 16 SUPPRESS, 17 CVF
 * The same RXCUI repeats across many rows (its own source, plus every cross-referenced vocabulary
 * RxNorm links to) — filtering to `SAB = 'RXNORM'` and `ISPREF = 'Y'` picks exactly one preferred
 * name per concept, the standard technique for a clean "one row per drug" view instead of loading
 * every synonym. Also filters to English, non-suppressed, and the 4 prescribable term types (see
 * `PRESCRIBABLE_TTY`) — ingredients/brand-name-only/dose-form rows aren't things a prescriber
 * picks directly. Returns null for anything that doesn't pass every filter.
 */
export function parseRxNormLine(rawLine: string): RxNormRecord | null {
  const line = rawLine.replace(/\r$/, '');
  if (!line) return null;
  const fields = line.split('|');
  if (fields.length < 18) return null;

  const [, lat, , , , , ispref, , , , , sab, tty, code, str, , suppress] = fields;
  if (lat !== 'ENG') return null;
  if (sab !== 'RXNORM') return null;
  if (ispref !== 'Y') return null;
  if (suppress !== 'N') return null;
  if (!code || !str || !tty) return null;
  if (!PRESCRIBABLE_TTY.has(tty)) return null;

  return { code, display: str };
}

const BATCH_SIZE = 1000;

/**
 * Streams the file line by line — RXNCONSO.RRF from the full release is large (millions of lines
 * across every source vocabulary RxNorm cross-references), so this must never load the whole file
 * into memory. `onConflict` upserts on `(system, code)`, same as `loadIcd10Cm`, so a newer monthly
 * release's re-run updates display names in place.
 */
export async function loadRxNorm(trx: Executor, filePath: string): Promise<{ loaded: number }> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf-8' }), crlfDelay: Infinity });

  let batch: RxNormRecord[] = [];
  const seenCodes = new Set<string>();
  let loaded = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await trx
      .insertInto('terminology_codes')
      .values(batch.map((r) => ({ system: RXNORM_SYSTEM, code: r.code, display: r.display, billable: null })))
      .onConflict((oc) => oc.columns(['system', 'code']).doUpdateSet((eb) => ({ display: eb.ref('excluded.display') })))
      .execute();
    loaded += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    const record = parseRxNormLine(line);
    if (!record || seenCodes.has(record.code)) continue;
    seenCodes.add(record.code);
    batch.push(record);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return { loaded };
}
