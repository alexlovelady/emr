'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createAllergy } from '@/lib/actions/allergies';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function AddAllergyDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createAllergy, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add allergy
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add allergy</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <div className="space-y-1.5">
            <Label htmlFor="substance">Substance</Label>
            <Input id="substance" name="substance" placeholder="Penicillin" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reaction">Reaction (optional)</Label>
            <Input id="reaction" name="reaction" placeholder="Hives" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="severity">Severity (optional)</Label>
            <Select name="severity">
              <SelectTrigger id="severity">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add allergy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
