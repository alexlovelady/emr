'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cancelAppointment } from '@/lib/actions/appointments';

export function CancelAppointmentButton({ patientId, appointmentId }: { patientId: string; appointmentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await cancelAppointment(patientId, appointmentId, 'Cancelled by patient');
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-1.5">
          <Button size="sm" variant="destructive" disabled={submitting} onClick={onConfirm}>
            {submitting ? 'Cancelling…' : 'Confirm cancel'}
          </Button>
          <Button size="sm" variant="ghost" disabled={submitting} onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
      Cancel
    </Button>
  );
}
