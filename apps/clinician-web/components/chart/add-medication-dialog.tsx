'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createMedication } from '@/lib/actions/medications';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function AddMedicationDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createMedication, null);

  useCloseOnSuccess(state, () => {
    if (!state?.ok) return;
    if ((state.data.doseValidation?.warnings.length ?? 0) === 0) setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add medication
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add medication</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <div className="space-y-1.5">
            <Label htmlFor="medicationName">Medication</Label>
            <Input id="medicationName" name="medicationName" placeholder="Lisinopril" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dose">Dose</Label>
              <Input id="dose" name="dose" placeholder="10mg" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="route">Route</Label>
              <Input id="route" name="route" placeholder="oral" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="frequency">Frequency</Label>
              <Input id="frequency" name="frequency" placeholder="daily" />
            </div>
          </div>
          {state &&
            state.ok &&
            state.data.doseValidation?.warnings.map((w, i) => (
              <Alert key={i}>{w}</Alert>
            ))}
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add medication'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
