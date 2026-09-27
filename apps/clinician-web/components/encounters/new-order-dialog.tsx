'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createOrder } from '@/lib/actions/orders';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function NewOrderDialog({ encounterId }: { encounterId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createOrder, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Place order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place order</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="encounterId" value={encounterId} />
          <div className="space-y-1.5">
            <Label htmlFor="orderingPractitionerId">Ordering practitioner ID</Label>
            <Input id="orderingPractitionerId" name="orderingPractitionerId" placeholder="UUID" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orderType">Order type</Label>
            <Input id="orderType" name="orderType" placeholder="laboratory" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Description</Label>
            <Input id="displayName" name="displayName" placeholder="Complete Blood Count" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code (optional)</Label>
              <Input id="code" name="code" placeholder="CBC" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue="routine">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">Stat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Placing…' : 'Place order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
