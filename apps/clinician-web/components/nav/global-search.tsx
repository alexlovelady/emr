'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { SearchResult } from '@/lib/types';

function hrefFor(result: SearchResult): string {
  if (result.resourceType === 'Patient') return `/patients/${result.resourceId}`;
  if (result.patientId) return `/patients/${result.patientId}`;
  return '#';
}

export function GlobalSearch() {
  const { has } = usePermissions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!query.trim()) {
        setResults(null);
        return;
      }
      fetch(`/api/backend/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SearchResult[]) => setResults(data))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!has(PERMISSION_KEYS.PATIENT_READ_CLINICAL)) return null;

  return (
    <div ref={containerRef} className="relative w-80">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search patients, notes, results, tasks…"
        className="pl-8"
      />
      {open && results !== null && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-md">
          {results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No results.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {results.map((r) => {
                const href = hrefFor(r);
                const content = (
                  <>
                    <span className="truncate">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.resourceType}</span>
                  </>
                );
                return (
                  <li key={`${r.resourceType}-${r.resourceId}`}>
                    {href === '#' ? (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted-foreground">{content}</div>
                    ) : (
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
