import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { RXNORM_SYSTEM, validateRxNormCode, searchRxNorm } from './rxnav-client.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface CodeValidation {
  /** False both for a genuinely unknown code AND for a system with no rows loaded yet — see `checked`. */
  valid: boolean;
  /** False when nothing for `system` has been loaded at all — a real "no data to check against" gap,
   * not a claim that the code is wrong. Distinguishing this from `valid: false` is the whole point of
   * "warn, don't hard-block": an unloaded system must never look identical to a rejected code. */
  checked: boolean;
  display?: string;
}

export interface ConceptMatch {
  code: string;
  display: string;
}

/**
 * Phase M (eCW/athena parity roadmap): a small read-only code lookup, dispatched by `system`.
 * `RxNorm` goes to NLM's free, live RxNav API (see `rxnav-client.ts`'s doc comment for why —
 * no account, no bulk download, always current). Every other system (today, just `ICD-10`) queries
 * `terminology_codes`, the global reference-data catalog loaded once by this package's
 * `scripts/seed.ts` from a downloaded flat file. Stateless and transaction-per-call for the local
 * path, same convention as every domain repository in this codebase (e.g. `domains/clinical`'s
 * `ProblemRepository`) — no constructor state, no DI wiring needed to use it from another domain's
 * service.
 */
export class TerminologyService {
  /**
   * "Warn, don't hard-block" per the plan: a caller checks `checked` before deciding whether an
   * `!valid` result means anything — an unloaded local system, or an unreachable RxNav request,
   * must never be presented as "this code is wrong."
   */
  async validateCode(trx: Executor, system: string, code: string): Promise<CodeValidation> {
    if (system === RXNORM_SYSTEM) return validateRxNormCode(code);

    const row = await trx
      .selectFrom('terminology_codes')
      .select(['display'])
      .where('system', '=', system)
      .where('code', '=', code)
      .executeTakeFirst();
    if (row) return { valid: true, checked: true, display: row.display };

    const systemLoaded = await trx
      .selectFrom('terminology_codes')
      .select(['id'])
      .where('system', '=', system)
      .executeTakeFirst();
    return { valid: false, checked: systemLoaded !== undefined };
  }

  /**
   * Matches on a code prefix (typing a raw code directly) OR a full-text search over `display`
   * (typing a condition/drug name) — `websearch_to_tsquery` is the same safe, parameterized
   * plain-phrase search `packages/search-adapter`'s `PostgresSearchIndexGateway` already uses,
   * ranked by `ts_rank` when it's the display match driving the result. Excludes ICD-10-CM's
   * non-billable category-header rows (`billable = false`) — `validateCode` still recognizes them
   * for a direct lookup, but a typeahead should never suggest a code you can't actually bill with.
   */
  async searchConcepts(trx: Executor, system: string, query: string, limit = 20): Promise<ConceptMatch[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    if (system === RXNORM_SYSTEM) return searchRxNorm(trimmed, limit);

    const result = await sql<{ code: string; display: string }>`
      select code, display
      from terminology_codes
      where system = ${system}
        and billable is distinct from false
        and (
          code ilike ${trimmed + '%'}
          or search_vector @@ websearch_to_tsquery('english', ${trimmed})
        )
      order by
        (code ilike ${trimmed + '%'}) desc,
        ts_rank(search_vector, websearch_to_tsquery('english', ${trimmed})) desc
      limit ${limit}
    `.execute(trx);

    return result.rows;
  }
}
