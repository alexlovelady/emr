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

interface PayerPerformanceRow {
  payerName: string;
  claimsTotal: number;
  claimsSubmitted: number;
  claimsPaid: number;
  claimsDenied: number;
  totalPaidAmount: number;
  avgDaysToPayment: number | null;
}

function PayerPerformanceSummary({ query }: { query: GovernedQuery }) {
  const [submittedAfter, setSubmittedAfter] = useState('');
  const [result, setResult] = useState<PayerPerformanceRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await executeGovernedQuery(query.name, { submittedAfter: submittedAfter || undefined });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setResult(res.data as PayerPerformanceRow[]);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{query.name.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-muted-foreground">{query.description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Submitted after (optional)</Label>
          <Input type="date" value={submittedAfter} onChange={(e) => setSubmittedAfter(e.target.value)} className="w-40" />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={run}>
          {pending ? 'Running…' : 'Run'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-4 font-medium">Payer</th>
                <th className="py-1.5 pr-4 font-medium">Total</th>
                <th className="py-1.5 pr-4 font-medium">Submitted</th>
                <th className="py-1.5 pr-4 font-medium">Paid</th>
                <th className="py-1.5 pr-4 font-medium">Denied</th>
                <th className="py-1.5 pr-4 font-medium">Total paid ($)</th>
                <th className="py-1.5 font-medium">Avg days to payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((row) => (
                <tr key={row.payerName}>
                  <td className="py-1.5 pr-4">{row.payerName}</td>
                  <td className="py-1.5 pr-4">{row.claimsTotal}</td>
                  <td className="py-1.5 pr-4">{row.claimsSubmitted}</td>
                  <td className="py-1.5 pr-4">{row.claimsPaid}</td>
                  <td className="py-1.5 pr-4">{row.claimsDenied}</td>
                  <td className="py-1.5 pr-4">{row.totalPaidAmount.toFixed(2)}</td>
                  <td className="py-1.5">{row.avgDaysToPayment === null ? '—' : row.avgDaysToPayment.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface RemittanceTrendRow {
  month: string;
  claimsCount: number;
  totalPaidAmount: number;
  totalAdjustmentAmount: number;
  totalPatientResponsibilityAmount: number;
}

function RemittanceTrendsByMonth({ query }: { query: GovernedQuery }) {
  const [payerName, setPayerName] = useState('');
  const [result, setResult] = useState<RemittanceTrendRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const res = await executeGovernedQuery(query.name, { payerName: payerName.trim() || undefined });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setResult(res.data as RemittanceTrendRow[]);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{query.name.replace(/_/g, ' ')}</h3>
        <p className="text-xs text-muted-foreground">{query.description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label>Payer (optional)</Label>
          <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} className="w-48" placeholder="Acme Payer" />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={run}>
          {pending ? 'Running…' : 'Run'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-4 font-medium">Month</th>
                <th className="py-1.5 pr-4 font-medium">Claims</th>
                <th className="py-1.5 pr-4 font-medium">Paid ($)</th>
                <th className="py-1.5 pr-4 font-medium">Adjustments ($)</th>
                <th className="py-1.5 font-medium">Patient resp. ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.map((row) => (
                <tr key={row.month}>
                  <td className="py-1.5 pr-4">{row.month}</td>
                  <td className="py-1.5 pr-4">{row.claimsCount}</td>
                  <td className="py-1.5 pr-4">{row.totalPaidAmount.toFixed(2)}</td>
                  <td className="py-1.5 pr-4">{row.totalAdjustmentAmount.toFixed(2)}</td>
                  <td className="py-1.5">{row.totalPatientResponsibilityAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        if (q.name === 'payer_performance_summary') return <PayerPerformanceSummary key={q.name} query={q} />;
        if (q.name === 'remittance_trends_by_month') return <RemittanceTrendsByMonth key={q.name} query={q} />;
        return null;
      })}
    </div>
  );
}
