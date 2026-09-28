'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

/** Generic debounced-search dropdown — the caller owns the query state and the debounced fetch
 * (see `lib/use-terminology-search.ts`/`components/prescriptions/use-erx-search.ts`), this just
 * renders the input + results list. `onMouseDown` (not `onClick`) on each result fires selection
 * before the input's `onBlur` closes the list. */
export function Typeahead<T>({
  query,
  onQueryChange,
  results,
  renderLabel,
  onSelect,
  placeholder,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: T[];
  renderLabel: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-card shadow-md">
          {results.map((r, i) => (
            <li
              key={i}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
              onMouseDown={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              {renderLabel(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
