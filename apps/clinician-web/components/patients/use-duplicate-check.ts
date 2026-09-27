'use client';

import { useEffect, useState } from 'react';
import type { DuplicateCandidate } from '@/lib/types';

/** Debounced live "possible duplicate" check against the real deterministic scoring endpoint. */
export function useDuplicateCheck(params: { givenName: string; familyName: string; dateOfBirth: string }): DuplicateCandidate[] {
  const [results, setResults] = useState<DuplicateCandidate[]>([]);
  const { givenName, familyName, dateOfBirth } = params;

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!givenName && !familyName && !dateOfBirth) {
        setResults([]);
        return;
      }
      const query = new URLSearchParams();
      if (givenName) query.set('givenName', givenName);
      if (familyName) query.set('familyName', familyName);
      if (dateOfBirth) query.set('dateOfBirth', dateOfBirth);
      fetch(`/api/backend/patients/duplicates?${query.toString()}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [givenName, familyName, dateOfBirth]);

  return results;
}
