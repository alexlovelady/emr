'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { cancelPrescription, requestRefill } from '@/lib/actions/prescriptions';
import type { Prescription } from '@/lib/types';

const TERMINAL_STATUSES = new Set(['cancelled', 'completed', 'entered_in_error', 'rejected']);

export function PrescriptionsList({ prescriptions, patientId }: { prescriptions: Prescription[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const canPrescribe = has(PERMISSION_KEYS.MEDICATION_PRESCRIBE);

  if (prescriptions.length === 0) return null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="mt-6 space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescriptions</h3>
      <ul className="divide-y divide-border">
        {prescriptions.map((rx) => {
          const active = !TERMINAL_STATUSES.has(rx.status);
          return (
            <li key={rx.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{rx.medicationName ?? 'Prescription'}</div>
                <div className="text-xs text-muted-foreground">
                  {rx.pharmacyName} &middot; {rx.refillsRemaining}/{rx.refillsAuthorized} refills remaining
                </div>
              </div>
              {rx.isControlledSubstance && <Badge variant="warning">{rx.deaSchedule ?? 'controlled'}</Badge>}
              <Badge variant={rx.status === 'active' ? 'success' : 'outline'}>{rx.status}</Badge>
              {canPrescribe && active && (
                <>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => requestRefill(rx.id, patientId))}>
                    Request refill
                  </Button>
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => cancelPrescription(rx.id, patientId))}>
                    Cancel
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
