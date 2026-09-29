'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cancelAppointment } from '@/lib/actions/appointments';
import type { Appointment } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive' | 'warning'> = {
  scheduled: 'outline',
  confirmed: 'success',
  checked_in: 'success',
  cancelled: 'destructive',
  no_show: 'destructive',
};

const CANCELLABLE_STATUSES = new Set(['scheduled', 'confirmed']);

/**
 * Item 26 — replaces the old `CancelAppointmentButton` (which had no visible effect on the row's
 * own status badge until the full round trip completed). `useOptimistic` here flips the status
 * badge to "cancelled" and hides the cancel action the instant confirm is clicked, not after the
 * server responds; `cancelAppointment` already calls `revalidatePath` on success, so the real
 * server-rendered `appointment` prop matches by the time the transition settles.
 */
export function AppointmentRow({ patientId, appointment }: { patientId: string; appointment: Appointment }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(appointment.status);

  function onConfirm() {
    startTransition(async () => {
      setOptimisticStatus('cancelled');
      setConfirming(false);
      const result = await cancelAppointment(patientId, appointment.id, 'Cancelled by patient');
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{appointment.appointmentType}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(appointment.scheduledStart).toLocaleString()} – {new Date(appointment.scheduledEnd).toLocaleTimeString()}
        </div>
        {appointment.visitType === 'telehealth' && appointment.videoJoinUrlPatient && (
          <a
            href={appointment.videoJoinUrlPatient}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Video className="h-3 w-3" /> Join video visit
          </a>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
      <Badge variant={STATUS_VARIANT[optimisticStatus] ?? 'outline'}>{optimisticStatus.replace(/_/g, ' ')}</Badge>
      {CANCELLABLE_STATUSES.has(optimisticStatus) &&
        (confirming ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="destructive" disabled={isPending} onClick={onConfirm}>
              Confirm cancel
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Cancel
          </Button>
        ))}
    </li>
  );
}
