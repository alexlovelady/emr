'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createTask } from '@/lib/actions/tasks';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function NewTaskDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createTask, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Call patient about lab results" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taskType">Task type</Label>
            <Input id="taskType" name="taskType" placeholder="follow_up" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select name="priority" defaultValue="normal">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedToUserId">Assign to (user ID, optional)</Label>
              <Input id="assignedToUserId" name="assignedToUserId" placeholder="UUID" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="patientId">Patient ID (optional)</Label>
            <Input id="patientId" name="patientId" placeholder="UUID" />
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
