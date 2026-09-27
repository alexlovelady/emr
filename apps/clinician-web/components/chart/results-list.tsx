import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import type { DiagnosticReport } from '@/lib/types';

/**
 * Staff see every review_status (including pending) — unlike the patient portal, which
 * deliberately filters to reviewed-only results (Phase 8's ADR on result release).
 */
export function ResultsList({ reports }: { reports: DiagnosticReport[] }) {
  if (reports.length === 0) {
    return <EmptyState icon={FlaskConical} message="No results recorded." />;
  }

  return (
    <ul className="divide-y divide-border">
      {reports.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <FlaskConical
            className={`h-4 w-4 shrink-0 ${r.criticalFlag ? 'text-destructive' : 'text-muted-foreground'}`}
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{r.displayName}</div>
            <div className="text-xs text-muted-foreground">{new Date(r.issuedAt).toLocaleDateString()}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.criticalFlag && <Badge variant="destructive">critical</Badge>}
            {r.abnormalFlag && !r.criticalFlag && <Badge variant="warning">abnormal</Badge>}
            <Badge variant={r.reviewStatus === 'reviewed' ? 'success' : 'outline'}>{r.reviewStatus}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
