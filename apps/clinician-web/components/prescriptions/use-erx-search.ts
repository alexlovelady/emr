'use client';

import { useEffect, useState } from 'react';

interface MedicationConcept {
  code: string;
  display: string;
  codeSystem: string;
}

interface Pharmacy {
  ncpdpId: string;
  name: string;
  city: string;
  state: string;
  postalCode: string;
}

/** Debounced client-side typeahead against the generic backend proxy — a read, not a mutation, so a Server Action isn't the right fit. */
function useDebouncedErxSearch<T>(path: string, query: string): T[] {
  const [results, setResults] = useState<T[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/backend/erx/${path}?query=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [path, query]);

  return results;
}

export function useMedicationSearch(query: string): MedicationConcept[] {
  return useDebouncedErxSearch<MedicationConcept>('medications/search', query);
}

export function usePharmacySearch(query: string): Pharmacy[] {
  return useDebouncedErxSearch<Pharmacy>('pharmacies/search', query);
}
