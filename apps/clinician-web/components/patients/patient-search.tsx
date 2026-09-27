'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PatientListTable } from './patient-list-table';
import type { Patient } from '@/lib/types';

/**
 * Filters client-side over the full tenant list — GET /patients has no server-side search
 * param today (see apps/clinician-web/README.md's known trims). Fine at pilot-tenant scale;
 * revisit if a tenant's patient count grows large enough to make the full fetch itself slow.
 */
export function PatientSearch({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => `${p.givenName} ${p.familyName}`.toLowerCase().includes(q) || p.dateOfBirth.includes(q));
  }, [patients, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or date of birth…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          <PatientListTable patients={filtered} />
        </CardContent>
      </Card>
    </div>
  );
}
