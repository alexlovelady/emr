'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createIdentifier } from '@/lib/actions/identifiers';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function AddIdentifierDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const action = createIdentifier.bind(null, patientId);
  const [state, formAction, isPending] = useActionState(action, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add identifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add external identifier</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifierSystem">System</Label>
            <Input id="identifierSystem" name="identifierSystem" placeholder="MRN" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="value">Value</Label>
            <Input id="value" name="value" required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPrimary" className="h-4 w-4 rounded border-input" /> Primary identifier
          </label>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add identifier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
