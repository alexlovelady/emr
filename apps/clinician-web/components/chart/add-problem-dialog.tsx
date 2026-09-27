'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createProblem } from '@/lib/actions/problems';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function AddProblemDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createProblem, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add problem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add problem</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Problem</Label>
            <Input id="displayName" name="displayName" placeholder="Type 2 diabetes" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codeSystem">Code system</Label>
              <Input id="codeSystem" name="codeSystem" defaultValue="ICD-10" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" placeholder="E11.9" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onsetDate">Onset date (optional)</Label>
            <Input id="onsetDate" name="onsetDate" type="date" />
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add problem'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
