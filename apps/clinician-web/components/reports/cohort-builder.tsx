'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CohortDslAssistant } from '@/components/reports/cohort-dsl-assistant';
import { CohortBreakdownChart } from '@/components/reports/cohort-breakdown-chart';
import { saveCohort, executeAdHocCohort, previewCohort, executeCohortBreakdown } from '@/lib/actions/cohorts';
import type { CohortBreakdownDimension, CohortBreakdownResult, CohortCondition, CohortExecutionRow } from '@/lib/types';

type RowType =
  | 'age'
  | 'condition'
  | 'allergy'
  | 'medication'
  | 'encounter'
  | 'appointment'
  | 'coverage'
  | 'note'
  | 'latest_hba1c'
  | 'latest_observation_value'
  | 'days_since_completed_encounter';

const ROW_TYPES: { value: RowType; label: string; kind: 'field' | 'concept' | 'measure' }[] = [
  { value: 'age', label: 'Age', kind: 'field' },
  { value: 'condition', label: 'Condition', kind: 'concept' },
  { value: 'allergy', label: 'Allergy', kind: 'concept' },
  { value: 'medication', label: 'Medication', kind: 'concept' },
  { value: 'encounter', label: 'Encounter type', kind: 'concept' },
  { value: 'appointment', label: 'Appointment status', kind: 'concept' },
  { value: 'coverage', label: 'Insurance payer', kind: 'concept' },
  { value: 'note', label: 'Signed note type', kind: 'concept' },
  { value: 'latest_hba1c', label: 'Latest HbA1c', kind: 'measure' },
  { value: 'latest_observation_value', label: 'Latest lab value (by LOINC code)', kind: 'measure' },
  { value: 'days_since_completed_encounter', label: 'Days since last completed encounter', kind: 'measure' },
];

/** Concepts beyond `condition` don't use a coding system — the row hides that input for them. */
const CONCEPT_HAS_SYSTEM: Partial<Record<RowType, boolean>> = { condition: true };
const CONCEPT_OPS: Partial<Record<RowType, { value: string; label: string }[]>> = {
  condition: [
    { value: 'active', label: 'active' },
    { value: 'resolved', label: 'resolved' },
    { value: 'has_code', label: 'has code' },
  ],
  allergy: [
    { value: 'active', label: 'active' },
    { value: 'resolved', label: 'resolved' },
    { value: 'has_code', label: 'has code' },
  ],
  medication: [
    { value: 'active', label: 'active' },
    { value: 'resolved', label: 'resolved' },
    { value: 'has_code', label: 'has code' },
  ],
  encounter: [{ value: 'has_type', label: 'has occurred' }],
  appointment: [{ value: 'has_status', label: 'has status' }],
  coverage: [{ value: 'has_payer', label: 'covered by (payer contains)' }],
  note: [{ value: 'has_type', label: 'has a signed note of type' }],
};

const OP_OPTIONS: Record<'field' | 'measure', { value: string; label: string }[]> = {
  field: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'between', label: 'between' },
  ],
  measure: [
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: '=', label: '=' },
  ],
};

const BREAKDOWN_DIMENSIONS: { value: CohortBreakdownDimension; label: string }[] = [
  { value: 'sex_at_birth', label: 'Sex at birth' },
  { value: 'age_bucket', label: 'Age (10-year bands)' },
  { value: 'active_condition_code', label: 'Active condition (top 10)' },
];

interface ConditionRow {
  type: RowType;
  op: string;
  system: string;
  code: string;
  value: string;
  valueHigh: string;
}

function emptyRow(): ConditionRow {
  return { type: 'age', op: 'gte', system: '', code: '', value: '', valueHigh: '' };
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
    if (!row.value.trim()) return null;
    if (CONCEPT_HAS_SYSTEM[row.type] && !row.system.trim()) return null;
    return {
      concept: row.type as 'condition' | 'allergy' | 'medication' | 'encounter' | 'appointment' | 'coverage' | 'note',
      system: row.system.trim() || null,
      op: row.op as 'active' | 'resolved' | 'has_code' | 'has_type' | 'has_status' | 'has_payer',
      value: row.value.trim(),
    };
  }
  // measure
  if (row.type === 'latest_observation_value') {
    const v = Number(row.value);
    if (!row.code.trim() || !row.value.trim() || Number.isNaN(v)) return null;
    return { measure: 'latest_observation_value', code: row.code.trim(), op: row.op as '>' | '<' | '>=' | '<=' | '=', value: v };
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

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewPending, setPreviewPending] = useState(false);

  const [breakdownDimension, setBreakdownDimension] = useState<CohortBreakdownDimension>('sex_at_birth');
  const [breakdown, setBreakdown] = useState<CohortBreakdownResult | null>(null);
  const [breakdownPending, setBreakdownPending] = useState(false);

  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Item 1: live, debounced count preview as the filter set changes — same ref-based debounce
  // pattern as patient-search.tsx (triggered from the edit handlers below, not a useEffect
  // reacting to `rows`, which would call setState synchronously in the effect body). Never
  // persists an execution row, so this can safely fire on every edit without bloating
  // `cohort_executions`.
  function schedulePreview(nextRows: ConditionRow[]) {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    const built = nextRows.map(toCondition);
    if (built.some((c) => c === null) || built.length === 0) {
      setPreviewCount(null);
      setPreviewPending(false);
      return;
    }
    setPreviewPending(true);
    previewDebounceRef.current = setTimeout(async () => {
      const result = await previewCohort({ version: 1, entity: 'patient', where: { all: built as CohortCondition[] } });
      setPreviewPending(false);
      setPreviewCount(result.ok ? result.data.resultCount : null);
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, []);

  function updateRow(i: number, patch: Partial<ConditionRow>) {
    setRows((r) => {
      const next = r.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
      schedulePreview(next);
      return next;
    });
  }

  function addRow() {
    setRows((r) => {
      const next = [...r, emptyRow()];
      schedulePreview(next);
      return next;
    });
  }

  function removeRow(i: number) {
    setRows((r) => {
      const next = r.filter((_, idx) => idx !== i);
      schedulePreview(next);
      return next;
    });
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
    setBreakdown(null);
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

  async function onSlice() {
    const built = conditions();
    if (!built) {
      setError('Fill in every condition row before slicing.');
      return;
    }
    setBreakdownPending(true);
    setError(null);
    const result = await executeCohortBreakdown({ version: 1, entity: 'patient', where: { all: built } }, breakdownDimension);
    setBreakdownPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBreakdown(result.data);
  }

  return (
    <div className="space-y-4">
      <CohortDslAssistant onExecuted={onExecuted} />

      <div className="space-y-2">
        <Label>Conditions (all must match)</Label>
        {rows.map((row, i) => {
          const kind = kindOf(row.type);
          const ops = kind === 'concept' ? (CONCEPT_OPS[row.type] ?? []) : OP_OPTIONS[kind];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <Select
                value={row.type}
                onValueChange={(v) => {
                  const nextType = v as RowType;
                  const nextKind = kindOf(nextType);
                  const nextOps = nextKind === 'concept' ? (CONCEPT_OPS[nextType] ?? []) : OP_OPTIONS[nextKind];
                  updateRow(i, { type: nextType, op: nextOps[0]?.value ?? '' });
                }}
              >
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={row.op} onValueChange={(v) => updateRow(i, { op: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ops.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kind === 'concept' && CONCEPT_HAS_SYSTEM[row.type] && (
                <Input placeholder="code system (e.g. icd10)" className="w-40" value={row.system} onChange={(e) => updateRow(i, { system: e.target.value })} />
              )}
              {row.type === 'latest_observation_value' && (
                <Input placeholder="LOINC code" className="w-32" value={row.code} onChange={(e) => updateRow(i, { code: e.target.value })} />
              )}
              <Input
                placeholder={kind === 'concept' ? 'value' : 'value'}
                className="w-40"
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
              />
              {kind === 'field' && row.op === 'between' && (
                <Input placeholder="to" className="w-32" value={row.valueHigh} onChange={(e) => updateRow(i, { valueHigh: e.target.value })} />
              )}
              <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(i)} disabled={rows.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          <Plus className="mr-1.5 h-4 w-4" /> Add condition
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {previewPending ? 'Estimating…' : previewCount !== null ? `${previewCount.toLocaleString()} matching patient(s)` : 'Fill in every row to see a live count'}
      </p>

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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onRun}>
          {pending ? 'Running…' : 'Run without saving'}
        </Button>
        <Button type="button" disabled={pending} onClick={onSave}>
          {pending ? 'Saving…' : 'Save cohort'}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <Label>Slice this population by</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={breakdownDimension} onValueChange={(v) => setBreakdownDimension(v as CohortBreakdownDimension)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BREAKDOWN_DIMENSIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={breakdownPending} onClick={onSlice}>
            {breakdownPending ? 'Slicing…' : 'Slice'}
          </Button>
        </div>
        {breakdown && <CohortBreakdownChart result={breakdown} />}
      </div>
    </div>
  );
}
