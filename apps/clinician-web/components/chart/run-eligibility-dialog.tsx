'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { runEligibilityCheck } from '@/lib/actions/eligibility';
import type { Coverage } from '@/lib/types';

export function RunEligibilityDialog({ patientId, coverages }: { patientId: string; coverages: Coverage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coverageId, setCoverageId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!coverageId) return;
    setSubmitting(true);
    setError(null);
    const result = await runEligibilityCheck(patientId, coverageId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setCoverageId('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={coverages.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Run eligibility check
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run eligibility check</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="coverageId">Coverage</Label>
            <Select value={coverageId} onValueChange={setCoverageId}>
              <SelectTrigger id="coverageId">
                <SelectValue placeholder="Select a coverage" />
              </SelectTrigger>
              <SelectContent>
                {coverages.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.payerName} — {c.memberId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            This environment has no real clearinghouse connection — the result is a fixed stub
            response, not a live payer check.
          </p>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button onClick={onSubmit} disabled={submitting || !coverageId}>
              {submitting ? 'Checking…' : 'Run check'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
