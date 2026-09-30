'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { reviewDiagnosticReport } from '@/lib/actions/results';
import { LabResultExplanationTrigger } from '@/components/chart/lab-result-explanation-trigger';
import type { DiagnosticReport } from '@/lib/types';

/**
 * Staff see every review_status (including pending) — unlike the patient portal, which
 * deliberately filters to reviewed-only results (Phase 8's ADR on result release).
 */
export function ResultsList({ reports, patientId }: { reports: DiagnosticReport[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const canReview = has(PERMISSION_KEYS.RESULT_REVIEW);

  function onReview(id: string, reviewStatus: 'reviewed' | 'acknowledged') {
    startTransition(async () => {
      const result = await reviewDiagnosticReport(id, patientId, reviewStatus);
      if (!result.ok) toast.error(result.error);
    });
  }

  if (reports.length === 0) {
    return <EmptyState icon={FlaskConical} message="No results recorded." />;
  }

  return (
    <ul className="divide-y divide-border">
      {reports.map((r) => (
        <li key={r.id} className="space-y-2 py-3">
          <div className="flex items-center gap-3">
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
              {canReview && r.reviewStatus === 'pending' && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => onReview(r.id, 'reviewed')}>
                  Mark reviewed
                </Button>
              )}
              {canReview && r.reviewStatus === 'reviewed' && (
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onReview(r.id, 'acknowledged')}>
                  Acknowledge
                </Button>
              )}
            </div>
          </div>
          <div className="pl-7">
            <LabResultExplanationTrigger reportId={r.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
