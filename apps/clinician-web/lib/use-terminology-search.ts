'use client';

import { useEffect, useState } from 'react';

export interface ConceptMatch {
  code: string;
  display: string;
}

/**
 * Debounced client-side typeahead against `GET /api/v1/terminology/search` (via the generic
 * backend proxy) — a read, not a mutation, so a Server Action isn't the right fit, same reasoning
 * `components/prescriptions/use-erx-search.ts` already documents for the eRx lookups. `system` is
 * `'ICD-10'` (a local bulk-loaded table) or `'RxNorm'` (a live lookup against NLM's RxNav API) —
 * see `@ehr/terminology`'s own doc comments for what backs each one.
 */
export function useTerminologySearch(system: string, query: string): ConceptMatch[] {
  const [results, setResults] = useState<ConceptMatch[]>([]);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length === 0) return;
    const handle = setTimeout(() => {
      fetch(`/api/backend/terminology/search?system=${encodeURIComponent(system)}&query=${encodeURIComponent(trimmed)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((body: { items?: ConceptMatch[] }) => setResults(body.items ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [system, trimmed]);

  // Computed from render-time `trimmed` rather than clearing `results` via a synchronous setState
  // in the effect above — an empty query means "show nothing," regardless of stale prior results.
  return trimmed.length === 0 ? [] : results;
}
