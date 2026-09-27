'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createCharge } from '@/lib/actions/charges';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function CaptureChargeDialog({ patientId, encounterId }: { patientId: string; encounterId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createCharge, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Capture charge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture charge</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="encounterId" value={encounterId} />
          <div className="space-y-1.5">
            <Label htmlFor="billingPractitionerId">Billing practitioner ID</Label>
            <Input id="billingPractitionerId" name="billingPractitionerId" placeholder="UUID" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codeSystem">Code system</Label>
              <Select name="codeSystem" defaultValue="CPT">
                <SelectTrigger id="codeSystem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPT">CPT</SelectItem>
                  <SelectItem value="HCPCS">HCPCS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="99213" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Office visit, established patient" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="units">Units</Label>
              <Input id="units" name="units" type="number" defaultValue={1} min={1} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unitPrice">Unit price ($)</Label>
              <Input id="unitPrice" name="unitPrice" type="number" step="0.01" min={0} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diagnosisCodes">Diagnosis codes (comma-separated)</Label>
            <Input id="diagnosisCodes" name="diagnosisCodes" placeholder="E11.9, I10" />
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Capturing…' : 'Capture charge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
