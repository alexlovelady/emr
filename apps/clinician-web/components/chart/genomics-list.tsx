'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Dna } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { reviewGenomicReport } from '@/lib/actions/genomics';
import type { GenomicReport } from '@/lib/types';

const SIGNIFICANCE_VARIANT: Record<string, 'destructive' | 'warning' | 'outline' | 'success'> = {
  pathogenic: 'destructive',
  likely_pathogenic: 'destructive',
  uncertain_significance: 'warning',
  likely_benign: 'outline',
  benign: 'success',
};

/** Staff see every review_status (including pending) — same posture as `ResultsList`. */
export function GenomicsList({ reports, patientId }: { reports: GenomicReport[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const canReview = has(PERMISSION_KEYS.GENOMIC_RESULT_REVIEW);

  function onReview(id: string, reviewStatus: 'reviewed' | 'acknowledged') {
    startTransition(async () => {
      const result = await reviewGenomicReport(id, patientId, reviewStatus);
      if (!result.ok) toast.error(result.error);
    });
  }

  if (reports.length === 0) {
    return <EmptyState icon={Dna} message="No genomic test results recorded." />;
  }

  return (
    <ul className="divide-y divide-border">
      {reports.map((r) => (
        <li key={r.id} className="space-y-2 py-3">
          <div className="flex items-center gap-3">
            <Dna className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.displayName}</div>
              <div className="text-xs text-muted-foreground">{new Date(r.issuedAt).toLocaleDateString()}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
          {r.conclusion && <p className="pl-7 text-sm text-muted-foreground">{r.conclusion}</p>}
          <ul className="space-y-1.5 pl-7">
            {r.findings.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{f.geneSymbol}</span>
                {f.hgvsNotation && <span className="font-mono text-xs text-muted-foreground">{f.hgvsNotation}</span>}
                {f.clinicalSignificance && (
                  <Badge variant={SIGNIFICANCE_VARIANT[f.clinicalSignificance] ?? 'outline'}>{f.clinicalSignificance.replace(/_/g, ' ')}</Badge>
                )}
                {f.phenotypeCategory && <Badge variant="secondary">{f.phenotypeCategory.replace(/_/g, ' ')}</Badge>}
                {f.interpretation && <span className="text-xs text-muted-foreground">{f.interpretation}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
