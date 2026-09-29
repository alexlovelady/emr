'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { PatientListTable } from './patient-list-table';
import type { Patient } from '@/lib/types';

/** Debounced so the search box doesn't push a new URL (and trigger a server refetch) on every
 * keystroke — 350ms is long enough to absorb normal typing speed, short enough to feel live. */
const DEBOUNCE_MS = 350;

export function PatientSearch({ patients, page, hasMore, initialSearch }: { patients: Patient[]; page: number; hasMore: boolean; initialSearch: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('search', value.trim());
      else params.delete('search');
      params.delete('page');
      const q = params.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    }, DEBOUNCE_MS);
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name or date of birth…" value={query} onChange={(e) => onChange(e.target.value)} className="pl-9" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <PatientListTable patients={patients} />
          <Pagination page={page} hasMore={hasMore} />
        </CardContent>
      </Card>
    </div>
  );
}
