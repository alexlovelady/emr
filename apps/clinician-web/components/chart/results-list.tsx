import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DiagnosticReport } from '@/lib/types';

/**
 * Staff see every review_status (including pending) — unlike the patient portal, which
 * deliberately filters to reviewed-only results (Phase 8's ADR on result release).
 */
export function ResultsList({ reports }: { reports: DiagnosticReport[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Results</CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results recorded.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <span>{r.displayName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(r.issuedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.criticalFlag && <Badge variant="destructive">critical</Badge>}
                  {r.abnormalFlag && !r.criticalFlag && <Badge variant="warning">abnormal</Badge>}
                  <Badge variant={r.reviewStatus === 'reviewed' ? 'success' : 'outline'}>{r.reviewStatus}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
