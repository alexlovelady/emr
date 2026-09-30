'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { cancelAppointment, updateAppointmentAgenda } from '@/lib/actions/appointments';
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

  const [isAgendaPending, startAgendaTransition] = useTransition();
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [agendaDraft, setAgendaDraft] = useState(appointment.patientAgenda ?? '');
  const [agendaError, setAgendaError] = useState<string | null>(null);

  function onConfirm() {
    startTransition(async () => {
      setOptimisticStatus('cancelled');
      setConfirming(false);
      const result = await cancelAppointment(patientId, appointment.id, 'Cancelled by patient');
      if (!result.ok) setError(result.error);
    });
  }

  function onSaveAgenda() {
    startAgendaTransition(async () => {
      setAgendaError(null);
      const result = await updateAppointmentAgenda(patientId, appointment.id, agendaDraft.trim());
      if (!result.ok) {
        setAgendaError(result.error);
        return;
      }
      setEditingAgenda(false);
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

        {CANCELLABLE_STATUSES.has(optimisticStatus) &&
          (editingAgenda ? (
            <div className="mt-2 space-y-1.5">
              <Textarea
                value={agendaDraft}
                onChange={(e) => setAgendaDraft(e.target.value)}
                placeholder="What would you like to discuss at this visit?"
                maxLength={2000}
                rows={3}
              />
              <div className="flex gap-1.5">
                <Button size="sm" disabled={isAgendaPending || agendaDraft.trim().length === 0} onClick={onSaveAgenda}>
                  Save agenda
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isAgendaPending}
                  onClick={() => {
                    setAgendaDraft(appointment.patientAgenda ?? '');
                    setEditingAgenda(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {agendaError && <Alert variant="destructive">{agendaError}</Alert>}
            </div>
          ) : (
            <div className="mt-1.5">
              {appointment.patientAgenda ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Your agenda:</span> {appointment.patientAgenda}{' '}
                  <button type="button" className="text-primary hover:underline" onClick={() => setEditingAgenda(true)}>
                    Edit
                  </button>
                </p>
              ) : (
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setEditingAgenda(true)}>
                  Add what you would like to discuss at this visit
                </button>
              )}
            </div>
          ))}
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
