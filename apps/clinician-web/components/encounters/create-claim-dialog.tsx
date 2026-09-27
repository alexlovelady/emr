'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createClaim } from '@/lib/actions/claims';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';
import type { Charge } from '@/lib/types';

export function CreateClaimDialog({ patientId, encounterId, codedCharges }: { patientId: string; encounterId: string; codedCharges: Charge[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createClaim, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={codedCharges.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Create claim
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create claim</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="encounterId" value={encounterId} />
          <div className="space-y-1.5">
            <Label htmlFor="billingPractitionerId">Billing practitioner ID</Label>
            <Input id="billingPractitionerId" name="billingPractitionerId" placeholder="UUID" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coverageId">Coverage ID (optional)</Label>
            <Input id="coverageId" name="coverageId" placeholder="UUID" />
          </div>
          <div className="space-y-2">
            <Label>Charges to bundle</Label>
            {codedCharges.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="chargeIds" value={c.id} className="h-4 w-4 rounded border-input" defaultChecked />
                {c.code} — {c.description} (${c.unitPrice} × {c.units})
              </label>
            ))}
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create claim'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
