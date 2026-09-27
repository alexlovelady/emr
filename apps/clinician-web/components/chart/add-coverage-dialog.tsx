'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createCoverage } from '@/lib/actions/coverages';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function AddCoverageDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const action = createCoverage.bind(null, patientId);
  const [state, formAction, isPending] = useActionState(action, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add coverage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add insurance coverage</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="payerName">Payer</Label>
              <Input id="payerName" name="payerName" placeholder="Acme Health Plan" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memberId">Member ID</Label>
              <Input id="memberId" name="memberId" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="groupNumber">Group number (optional)</Label>
              <Input id="groupNumber" name="groupNumber" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planName">Plan name (optional)</Label>
              <Input id="planName" name="planName" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coverageType">Type</Label>
            <Select name="coverageType" defaultValue="primary">
              <SelectTrigger id="coverageType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="tertiary">Tertiary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="effectiveStart">Effective start</Label>
              <Input id="effectiveStart" name="effectiveStart" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effectiveEnd">Effective end (optional)</Label>
              <Input id="effectiveEnd" name="effectiveEnd" type="date" />
            </div>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add coverage'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
