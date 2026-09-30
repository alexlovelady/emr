'use client';

import type { CohortBreakdownResult } from '@/lib/types';

/**
 * Item 1 (Epic-parity build-out, SlicerDicer-equivalent "slice" view) — a dependency-free
 * horizontal bar chart (plain divs, no charting library) rendering aggregate bucket counts only.
 * `executeCohortBreakdown` never returns patient-level data, so there is nothing here to redact.
 */
export function CohortBreakdownChart({ result }: { result: CohortBreakdownResult }) {
  if (result.buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">No data to break down.</p>;
  }
  const max = Math.max(...result.buckets.map((b) => b.count));

  return (
    <div className="space-y-1.5">
      {result.buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate" title={b.label}>
            {b.label}
          </span>
          <div className="h-4 flex-1 rounded bg-muted">
            <div
              className="h-4 rounded bg-primary"
              style={{ width: `${max > 0 ? (b.count / max) * 100 : 0}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{b.count}</span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">{result.totalCount} total across {result.buckets.length} group(s)</p>
    </div>
  );
}
