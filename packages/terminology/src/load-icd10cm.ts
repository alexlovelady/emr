import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

export interface Icd10CmRecord {
  code: string;
  display: string;
  billable: boolean;
}

/**
 * `system` value used for every row this loader writes — deliberately matching the `codeSystem`
 * string `domains/clinical`'s `ProblemService` already stores on real problem rows (see
 * `domains/clinical/test/tenant-isolation.spec.ts`'s fixtures), not a more "correct" identifier
 * like `ICD-10-CM` — `TerminologyService.validateCode()` only helps if it looks up the exact
 * string a problem was actually coded with.
 */
export const ICD10CM_SYSTEM = 'ICD-10';

/**
 * CMS's `icd10cm_order_YYYY.txt` is a fixed-width file, one line per code (both real billable
 * codes AND non-billable category headers, e.g. "A00" is the header for "A00.0"/"A00.1"/"A00.9").
 * Column positions per CMS's own documentation (`icd10OrderFiles.pdf` in the same release zip),
 * confirmed against the actual FY2027 file:
 *   [0:5]   order number (unused here)
 *   [6:13]  code, left-justified, space-padded, NO decimal point (e.g. "E119   ")
 *   [14]    billable flag: '1' = billable, '0' = category header
 *   [16:76] short description (unused here — long description is more useful for search/display)
 *   [77:]   long description
 * Returns null for a line that doesn't match this shape (e.g. a trailing blank line) rather than
 * throwing — a malformed line should never abort an otherwise-good load.
 */
export function parseIcd10CmOrderLine(rawLine: string): Icd10CmRecord | null {
  const line = rawLine.replace(/\r$/, '');
  if (line.length < 78) return null;

  const rawCode = line.slice(6, 13).trim();
  const billableFlag = line.slice(14, 15);
  const longDescription = line.slice(77).trim();
  if (!rawCode || !longDescription || (billableFlag !== '0' && billableFlag !== '1')) return null;

  return { code: formatIcd10Code(rawCode), display: longDescription, billable: billableFlag === '1' };
}

/** ICD-10-CM's own formatting rule: a decimal point follows the first three characters. */
export function formatIcd10Code(rawCode: string): string {
  return rawCode.length > 3 ? `${rawCode.slice(0, 3)}.${rawCode.slice(3)}` : rawCode;
}

const BATCH_SIZE = 1000;

/**
 * Streams the file line by line (it's ~15MB / ~100k lines — small enough to hold in memory, but
 * there's no reason to) and batches inserts. `onConflict` upserts on `(system, code)` so re-running
 * against a newer year's file updates descriptions in place instead of erroring or duplicating.
 */
export async function loadIcd10Cm(trx: Executor, filePath: string): Promise<{ loaded: number }> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'latin1' }), crlfDelay: Infinity });

  let batch: Icd10CmRecord[] = [];
  let loaded = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await trx
      .insertInto('terminology_codes')
      .values(batch.map((r) => ({ system: ICD10CM_SYSTEM, code: r.code, display: r.display, billable: r.billable })))
      .onConflict((oc) => oc.columns(['system', 'code']).doUpdateSet((eb) => ({ display: eb.ref('excluded.display'), billable: eb.ref('excluded.billable') })))
      .execute();
    loaded += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    const record = parseIcd10CmOrderLine(line);
    if (!record) continue;
    batch.push(record);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return { loaded };
}
