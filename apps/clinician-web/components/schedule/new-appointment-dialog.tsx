'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createAppointment } from '@/lib/actions/appointments';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';
import type { Patient } from '@/lib/types';

export function NewAppointmentDialog({ patients }: { patients: Patient[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createAppointment, null);

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New appointment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="patientId">Patient</Label>
            <Select name="patientId" required>
              <SelectTrigger id="patientId">
                <SelectValue placeholder="Select a patient" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.familyName}, {p.givenName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appointmentType">Appointment type</Label>
            <Input id="appointmentType" name="appointmentType" placeholder="office_visit" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheduledStart">Start</Label>
              <Input id="scheduledStart" name="scheduledStart" type="datetime-local" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduledEnd">End</Label>
              <Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="locationId">Location ID</Label>
              <Input id="locationId" name="locationId" placeholder="UUID" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practitionerId">Practitioner ID</Label>
              <Input id="practitionerId" name="practitionerId" placeholder="UUID" required />
            </div>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Booking…' : 'Book appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
