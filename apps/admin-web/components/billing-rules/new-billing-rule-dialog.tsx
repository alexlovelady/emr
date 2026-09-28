'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createBillingRule } from '@/lib/actions/billing-rules';
import type { BillingRuleType } from '@/lib/types';

const RULE_TYPE_LABELS: Record<BillingRuleType, string> = {
  code_requires_diagnosis_prefix: 'Code requires a diagnosis prefix',
  code_forbidden_for_sex: 'Code forbidden for a sex',
  code_max_units: 'Code has a max unit count',
};

export function NewBillingRuleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<BillingRuleType>('code_max_units');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [diagnosisPrefix, setDiagnosisPrefix] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('F');
  const [maxUnits, setMaxUnits] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRuleType('code_max_units');
    setDescription('');
    setCode('');
    setDiagnosisPrefix('');
    setSex('F');
    setMaxUnits('1');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !description.trim()) {
      setError('Code and description are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createBillingRule(
      ruleType === 'code_requires_diagnosis_prefix'
        ? { ruleType, description, parameters: { code, diagnosisPrefix } }
        : ruleType === 'code_forbidden_for_sex'
          ? { ruleType, description, parameters: { code, sex } }
          : { ruleType, description, parameters: { code, maxUnits: Number(maxUnits) } },
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New billing rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New billing rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rule type</Label>
            <Select value={ruleType} onValueChange={(v) => setRuleType(v as BillingRuleType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RULE_TYPE_LABELS) as BillingRuleType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {RULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to a coder when this rule blocks a charge"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">CPT/HCPCS code</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="99213" required />
          </div>

          {ruleType === 'code_requires_diagnosis_prefix' && (
            <div className="space-y-1.5">
              <Label htmlFor="diagnosisPrefix">Required diagnosis code prefix</Label>
              <Input id="diagnosisPrefix" value={diagnosisPrefix} onChange={(e) => setDiagnosisPrefix(e.target.value)} placeholder="E11" required />
            </div>
          )}

          {ruleType === 'code_forbidden_for_sex' && (
            <div className="space-y-1.5">
              <Label>Not billable for</Label>
              <Select value={sex} onValueChange={(v) => setSex(v as 'M' | 'F')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="F">Female</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {ruleType === 'code_max_units' && (
            <div className="space-y-1.5">
              <Label htmlFor="maxUnits">Max units</Label>
              <Input id="maxUnits" type="number" min="1" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} required />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Enforced when a coder finalizes coding on a charge with this exact code — not at initial charge capture.
          </p>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
