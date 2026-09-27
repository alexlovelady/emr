'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { exportCohortExecution } from '@/lib/actions/cohorts';
import type { CohortExecutionRow } from '@/lib/types';

export function CohortExecutionResult({ execution }: { execution: CohortExecutionRow }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onExport() {
    setPending(true);
    setError(null);
    const result = await exportCohortExecution(execution.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data.downloadUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span>
          <span className="font-semibold">{execution.resultCount}</span> matching patient(s)
          {execution.estimatedRows !== null && <span className="text-muted-foreground"> · estimated {execution.estimatedRows} before capping</span>}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={pending || execution.resultCount === 0} onClick={onExport}>
          {pending ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Run at {new Date(execution.executedAt).toLocaleString()}</p>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
