import { callBackend } from '@/lib/api-proxy';
import { GovernedQueriesPanel } from '@/components/reports/governed-queries-panel';
import type { GovernedQuery } from '@/lib/types';

export default async function GovernedQueriesPage() {
  const queries = await callBackend<GovernedQuery[]>('/api/v1/governed-queries');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Governed queries</h1>
        <p className="text-sm text-muted-foreground">Predefined, permission-gated report queries.</p>
      </div>
      <GovernedQueriesPanel queries={queries} />
    </div>
  );
}
