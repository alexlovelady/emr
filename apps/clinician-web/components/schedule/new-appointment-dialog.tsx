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
import type { Patient, Resource } from '@/lib/types';

export function NewAppointmentDialog({ patients, resources }: { patients: Patient[]; resources: Resource[] }) {
  const [open, setOpen] = useState(false);
  const [recurring, setRecurring] = useState(false);
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

          {resources.length > 0 && (
            <div className="space-y-1.5">
              <Label>Rooms / equipment (optional)</Label>
              <div className="space-y-1 rounded-md border p-2">
                {resources.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="resourceIds" value={r.id} className="h-4 w-4" />
                    {r.name} <span className="text-xs text-muted-foreground">({r.resourceType})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4" />
            Book as a recurring series
          </label>
          {recurring && (
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="recurrenceFrequency">Frequency</Label>
                <Select name="recurrenceFrequency" defaultValue="weekly">
                  <SelectTrigger id="recurrenceFrequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recurrenceCount">Occurrences</Label>
                <Input id="recurrenceCount" name="recurrenceCount" type="number" min={2} max={52} defaultValue={4} />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="override" className="h-4 w-4" />
            Book anyway even if this double-books the practitioner or a resource
          </label>

          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Booking…' : recurring ? 'Book series' : 'Book appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
