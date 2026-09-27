import { History } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/chart/empty-state';
import { RunCohortButton } from '@/components/reports/run-cohort-button';
import { CohortExecutionResult } from '@/components/reports/cohort-execution-result';
import type { CohortExecutionRow, CohortRow } from '@/lib/types';

export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cohort, executions] = await Promise.all([
    callBackend<CohortRow>(`/api/v1/cohorts/${id}`),
    callBackend<CohortExecutionRow[]>(`/api/v1/cohorts/${id}/executions`),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{cohort.name}</h1>
          {cohort.description && <p className="text-sm text-muted-foreground">{cohort.description}</p>}
        </div>
        <RunCohortButton cohortId={cohort.id} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Definition</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
            {JSON.stringify(cohort.dslPayload, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {executions.length === 0 ? (
            <EmptyState icon={History} message="This cohort hasn't been run yet." />
          ) : (
            executions.map((e) => <CohortExecutionResult key={e.id} execution={e} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
