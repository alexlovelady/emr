'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { executeGovernedQuery } from '@/lib/actions/governed-queries';
import type { GovernedQuery } from '@/lib/types';

function PatientCountByActiveProblem({ query }: { query: GovernedQuery }) {
  const [codeSystem, setCodeSystem] = useState('icd10');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await executeGovernedQuery(query.name, { codeSystem, code });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setResult(res.data);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{query.name.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-muted-foreground">{query.description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Code system</Label>
          <Input value={codeSystem} onChange={(e) => setCodeSystem(e.target.value)} className="w-32" />
        </div>
        <div className="space-y-1.5">
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} className="w-32" placeholder="E11" />
        </div>
        <Button type="button" size="sm" disabled={pending || !code.trim()} onClick={run}>
          {pending ? 'Running…' : 'Run'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result !== undefined && !error && <p className="text-lg font-semibold">{(result as { count: number }).count}</p>}
    </div>
  );
}

function EncountersByMonth({ query }: { query: GovernedQuery }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [result, setResult] = useState<{ month: string; count: number }[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await executeGovernedQuery(query.name, { startDate, endDate });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setResult(res.data as { month: string; count: number }[]);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{query.name.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-muted-foreground">{query.description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>End date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        <Button type="button" size="sm" disabled={pending || !startDate || !endDate} onClick={run}>
          {pending ? 'Running…' : 'Run'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {result.map((row) => (
              <tr key={row.month}>
                <td className="py-1.5 pr-4">{row.month}</td>
                <td className="py-1.5">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ClaimsStatusBreakdown({ query }: { query: GovernedQuery }) {
  const [result, setResult] = useState<{ status: string; count: number }[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await executeGovernedQuery(query.name, {});
    setPending(false);
    if (!res.ok) setError(res.error);
    else setResult(res.data as { status: string; count: number }[]);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{query.name.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-muted-foreground">{query.description}</p>
      </div>
      <Button type="button" size="sm" disabled={pending} onClick={run}>
        {pending ? 'Running…' : 'Run'}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {result.map((row) => (
              <tr key={row.status}>
                <td className="py-1.5 pr-4">{row.status}</td>
                <td className="py-1.5">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GovernedQueriesPanel({ queries }: { queries: GovernedQuery[] }) {
  return (
    <div className="space-y-4">
      {queries.map((q) => {
        if (q.name === 'patient_count_by_active_problem') return <PatientCountByActiveProblem key={q.name} query={q} />;
        if (q.name === 'encounters_by_month') return <EncountersByMonth key={q.name} query={q} />;
        if (q.name === 'claims_status_breakdown') return <ClaimsStatusBreakdown key={q.name} query={q} />;
        return null;
      })}
    </div>
  );
}
