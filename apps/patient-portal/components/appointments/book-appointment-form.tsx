'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { bookAppointment } from '@/lib/actions/appointments';
import type { BookableLocation, BookablePractitioner } from '@/lib/types';

const DURATIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

export function BookAppointmentForm({
  patientId,
  practitioners,
  locations,
}: {
  patientId: string;
  practitioners: BookablePractitioner[];
  locations: BookableLocation[];
}) {
  const router = useRouter();
  const [practitionerId, setPractitionerId] = useState(practitioners[0]?.id ?? '');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [appointmentType, setAppointmentType] = useState('office_visit');
  const [start, setStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!practitionerId || !locationId || !start) {
      setError('Fill in every field.');
      return;
    }
    const scheduledStart = new Date(start);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60_000);
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const result = await bookAppointment(patientId, {
      locationId,
      practitionerId,
      appointmentType,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    setStart('');
    router.refresh();
  }

  if (practitioners.length === 0 || locations.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No practitioners or locations are available to book with right now.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-dashed border-border p-4">
      <p className="text-xs text-muted-foreground">
        This doesn&apos;t show real open availability — pick a time and we&apos;ll tell you right away if it&apos;s
        already booked, the same check the front desk uses.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="practitioner">Provider</Label>
          <Select id="practitioner" value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Select id="location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointmentType">Visit type</Label>
          <Input id="appointmentType" value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duration">Duration</Label>
          <Select id="duration" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="start">Date and time</Label>
          <Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {success && <p className="text-sm text-emerald-600">Appointment booked.</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Booking…' : 'Book appointment'}
      </Button>
    </form>
  );
}
