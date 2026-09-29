'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { cancelAppointment, checkInAppointment, confirmAppointment, markNoShow, promoteAppointment, waitlistAppointment } from '@/lib/actions/appointments';
import { createEncounter } from '@/lib/actions/encounters';
import { RescheduleAppointmentDialog } from '@/components/schedule/reschedule-appointment-dialog';
import type { Appointment } from '@/lib/types';

const LEGAL_ACTIONS: Record<string, string[]> = {
  scheduled: ['confirm', 'check-in', 'reschedule', 'cancel', 'no-show', 'waitlist'],
  confirmed: ['check-in', 'reschedule', 'cancel', 'no-show'],
  checked_in: ['start-visit'],
  cancelled: ['waitlist'],
  waitlisted: ['promote'],
};

export function AppointmentRowActions({ appointment }: { appointment: Appointment }) {
  const router = useRouter();
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (!has(PERMISSION_KEYS.APPOINTMENT_MANAGE)) return null;

  const legal = LEGAL_ACTIONS[appointment.status] ?? [];
  if (legal.length === 0) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    startTransition(async () => {
      const result = await action();
      setBusy(false);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {legal.includes('confirm') && (
        <Button size="sm" variant="outline" disabled={isPending || busy} onClick={() => run(() => confirmAppointment(appointment.id))}>
          Confirm
        </Button>
      )}
      {legal.includes('check-in') && (
        <Button size="sm" variant="outline" disabled={isPending || busy} onClick={() => run(() => checkInAppointment(appointment.id))}>
          Check in
        </Button>
      )}
      {legal.includes('start-visit') && has(PERMISSION_KEYS.ENCOUNTER_CREATE) && (
        <Button
          size="sm"
          disabled={isPending || busy}
          onClick={() =>
            run(async () => {
              const result = await createEncounter(appointment.id, 'office_visit');
              if (result.ok) router.push(`/encounters/${result.data.id}`);
              return result;
            })
          }
        >
          Start visit
        </Button>
      )}
      {legal.includes('reschedule') && <RescheduleAppointmentDialog appointment={appointment} />}
      {legal.includes('cancel') && (
        <Button size="sm" variant="outline" disabled={isPending || busy} onClick={() => run(() => cancelAppointment(appointment.id))}>
          Cancel
        </Button>
      )}
      {legal.includes('no-show') && (
        <Button size="sm" variant="ghost" disabled={isPending || busy} onClick={() => run(() => markNoShow(appointment.id))}>
          No-show
        </Button>
      )}
      {legal.includes('waitlist') && (
        <Button size="sm" variant="ghost" disabled={isPending || busy} onClick={() => run(() => waitlistAppointment(appointment.id))}>
          Waitlist
        </Button>
      )}
      {legal.includes('promote') && (
        <Button size="sm" variant="outline" disabled={isPending || busy} onClick={() => run(() => promoteAppointment(appointment.id))}>
          Promote
        </Button>
      )}
    </div>
  );
}
