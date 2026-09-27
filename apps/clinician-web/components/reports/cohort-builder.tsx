'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CohortDslAssistant } from '@/components/reports/cohort-dsl-assistant';
import { saveCohort, executeAdHocCohort } from '@/lib/actions/cohorts';
import type { CohortCondition, CohortExecutionRow } from '@/lib/types';

type RowType = 'age' | 'condition' | 'allergy' | 'medication' | 'latest_hba1c' | 'days_since_completed_encounter';

const ROW_TYPES: { value: RowType; label: string; kind: 'field' | 'concept' | 'measure' }[] = [
  { value: 'age', label: 'Age', kind: 'field' },
  { value: 'condition', label: 'Condition', kind: 'concept' },
  { value: 'allergy', label: 'Allergy', kind: 'concept' },
  { value: 'medication', label: 'Medication', kind: 'concept' },
  { value: 'latest_hba1c', label: 'Latest HbA1c', kind: 'measure' },
  { value: 'days_since_completed_encounter', label: 'Days since last completed encounter', kind: 'measure' },
];

const OP_OPTIONS: Record<'field' | 'concept' | 'measure', { value: string; label: string }[]> = {
  field: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'between', label: 'between' },
  ],
  concept: [
    { value: 'active', label: 'active' },
    { value: 'resolved', label: 'resolved' },
    { value: 'has_code', label: 'has code' },
  ],
  measure: [
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: '=', label: '=' },
  ],
};

interface ConditionRow {
  type: RowType;
  op: string;
  system: string;
  value: string;
  valueHigh: string;
}

function emptyRow(): ConditionRow {
  return { type: 'age', op: 'gte', system: '', value: '', valueHigh: '' };
}

function kindOf(type: RowType): 'field' | 'concept' | 'measure' {
  return ROW_TYPES.find((t) => t.value === type)!.kind;
}

function toCondition(row: ConditionRow): CohortCondition | null {
  const kind = kindOf(row.type);
  if (kind === 'field') {
    if (row.op === 'between') {
      const lo = Number(row.value);
      const hi = Number(row.valueHigh);
      if (!row.value.trim() || !row.valueHigh.trim() || Number.isNaN(lo) || Number.isNaN(hi)) return null;
      return { field: 'age', op: 'between', value: [lo, hi] };
    }
    const v = Number(row.value);
    if (!row.value.trim() || Number.isNaN(v)) return null;
    return { field: 'age', op: row.op as 'eq' | 'gt' | 'gte' | 'lt' | 'lte', value: v };
  }
  if (kind === 'concept') {
    if (!row.system.trim() || !row.value.trim()) return null;
    return {
      concept: row.type as 'condition' | 'allergy' | 'medication',
      system: row.system.trim(),
      op: row.op as 'active' | 'resolved' | 'has_code',
      value: row.value.trim(),
    };
  }
  const v = Number(row.value);
  if (!row.value.trim() || Number.isNaN(v)) return null;
  return {
    measure: row.type as 'latest_hba1c' | 'days_since_completed_encounter',
    op: row.op as '>' | '<' | '>=' | '<=' | '=',
    value: v,
  };
}

export function CohortBuilder({ onExecuted }: { onExecuted: (execution: CohortExecutionRow) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<ConditionRow[]>([emptyRow()]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateRow(i: number, patch: Partial<ConditionRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function conditions(): CohortCondition[] | null {
    const built = rows.map(toCondition);
    if (built.some((c) => c === null) || built.length === 0) return null;
    return built as CohortCondition[];
  }

  async function onRun() {
    const built = conditions();
    if (!built) {
      setError('Fill in every condition row before running.');
      return;
    }
    setPending(true);
    setError(null);
    const result = await executeAdHocCohort({ version: 1, entity: 'patient', where: { all: built } });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onExecuted(result.data);
  }

  async function onSave() {
    const built = conditions();
    if (!built) {
      setError('Fill in every condition row before saving.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required to save a cohort.');
      return;
    }
    setPending(true);
    setError(null);
    const result = await saveCohort(name, description, { version: 1, entity: 'patient', where: { all: built } });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/reports/cohorts/${result.data.id}`);
  }

  return (
    <div className="space-y-4">
      <CohortDslAssistant onExecuted={onExecuted} />

      <div className="space-y-2">
        <Label>Conditions (all must match)</Label>
        {rows.map((row, i) => {
          const kind = kindOf(row.type);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <Select value={row.type} onValueChange={(v) => updateRow(i, { type: v as RowType, op: OP_OPTIONS[kindOf(v as RowType)][0]!.value })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={row.op} onValueChange={(v) => updateRow(i, { op: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OP_OPTIONS[kind].map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kind === 'concept' && (
                <Input placeholder="code system (e.g. icd10)" className="w-40" value={row.system} onChange={(e) => updateRow(i, { system: e.target.value })} />
              )}
              <Input
                placeholder={kind === 'concept' ? 'code / value' : 'value'}
                className="w-32"
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
              />
              {kind === 'field' && row.op === 'between' && (
                <Input placeholder="to" className="w-32" value={row.valueHigh} onChange={(e) => updateRow(i, { valueHigh: e.target.value })} />
              )}
              <Button type="button" size="icon" variant="ghost" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} disabled={rows.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, emptyRow()])}>
          <Plus className="mr-1.5 h-4 w-4" /> Add condition
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cohortName">Name (to save)</Label>
          <Input id="cohortName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Uncontrolled diabetics 45-75" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cohortDescription">Description</Label>
          <Input id="cohortDescription" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onRun}>
          {pending ? 'Running…' : 'Run without saving'}
        </Button>
        <Button type="button" disabled={pending} onClick={onSave}>
          {pending ? 'Saving…' : 'Save cohort'}
        </Button>
      </div>
    </div>
  );
}
