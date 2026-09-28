'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createPriorAuthorization } from '@/lib/actions/prior-authorizations';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';
import type { Coverage } from '@/lib/types';

export function NewPriorAuthDialog({ patientId, coverages }: { patientId: string; coverages: Coverage[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createPriorAuthorization, null);
  const [coverageId, setCoverageId] = useState('');

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={coverages.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> New prior auth
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New prior authorization request</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="coverageId" value={coverageId} />
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
          <div className="space-y-1.5">
            <Label htmlFor="requestedByPractitionerId">Requesting practitioner ID</Label>
            <Input id="requestedByPractitionerId" name="requestedByPractitionerId" placeholder="UUID" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="procedureCode">Procedure code</Label>
              <Input id="procedureCode" name="procedureCode" placeholder="70551" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diagnosisCode">Diagnosis code</Label>
              <Input id="diagnosisCode" name="diagnosisCode" placeholder="G43.909" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="procedureDescription">Procedure description</Label>
            <Input id="procedureDescription" name="procedureDescription" placeholder="MRI brain without contrast" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !coverageId}>
              {isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
