import type { CodeValidation, ConceptMatch } from './terminology.service.js';

/** Matches `CreateMedicationSchema`'s `rxnormCode` field name — there is no separate codeSystem
 * column for medications, so this is the implicit system every RxNorm lookup runs under. */
export const RXNORM_SYSTEM = 'RxNorm';

const RXNAV_BASE_URL = 'https://rxnav.nlm.nih.gov/REST';
/** RxNav has no documented SLA; a slow/unreachable response must not hang a prescribing request
 * forever — it degrades to `checked: false` (honestly "couldn't check"), same as an unloaded
 * local system, never to `valid: false` (which would claim a real code is wrong). */
const REQUEST_TIMEOUT_MS = 4000;

/** Clinical-drug and pack term types — what a prescriber actually selects, not every RxNorm
 * concept (ingredients, brand names, dose forms, relationship rows, etc. are all excluded). */
const PRESCRIBABLE_TTY = new Set(['SCD', 'SBD', 'GPCK', 'BPCK']);

interface RxNavPropertiesResponse {
  properties?: { name: string };
}

interface RxNavDrugsResponse {
  drugGroup?: {
    conceptGroup?: {
      tty?: string;
      conceptProperties?: { rxcui: string; name: string }[];
    }[];
  };
}

/**
 * Live lookup against NLM's free, public RxNav REST API (https://rxnav.nlm.nih.gov/) — no account,
 * license, or API key needed, unlike the RxNorm full-release flat file this replaces. Chosen over
 * a monthly bulk download because it's always current and needs no data-management step at all;
 * the tradeoff is a live network dependency per call, mitigated by the timeout above and by never
 * blocking a prescribing write on the result (see `MedicationService.create()`'s "warn, don't
 * hard-block" wiring — this is advisory either way).
 */
export async function validateRxNormCode(code: string): Promise<CodeValidation> {
  try {
    const res = await fetch(`${RXNAV_BASE_URL}/rxcui/${encodeURIComponent(code)}/properties.json`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { valid: false, checked: false };
    const body = (await res.json()) as RxNavPropertiesResponse;
    if (!body.properties) return { valid: false, checked: true };
    return { valid: true, checked: true, display: body.properties.name };
  } catch {
    return { valid: false, checked: false };
  }
}

export async function searchRxNorm(query: string, limit: number): Promise<ConceptMatch[]> {
  try {
    const res = await fetch(`${RXNAV_BASE_URL}/drugs.json?name=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as RxNavDrugsResponse;
    const groups = body.drugGroup?.conceptGroup ?? [];

    const results: ConceptMatch[] = [];
    for (const group of groups) {
      if (!group.tty || !PRESCRIBABLE_TTY.has(group.tty)) continue;
      for (const concept of group.conceptProperties ?? []) {
        results.push({ code: concept.rxcui, display: concept.name });
        if (results.length >= limit) return results;
      }
    }
    return results;
  } catch {
    return [];
  }
}
