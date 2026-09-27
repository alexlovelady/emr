'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Pill } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { AddMedicationDialog } from '@/components/chart/add-medication-dialog';
import { PrescribeDialog } from '@/components/medications/prescribe-dialog';
import { PrescriptionsList } from '@/components/medications/prescriptions-list';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { discontinueMedication } from '@/lib/actions/medications';
import type { MedicationItem, Prescription } from '@/lib/types';

const TERMINAL_STATUSES = new Set(['discontinued', 'completed', 'entered_in_error']);

export function MedicationsPanel({
  medications,
  prescriptions,
  patientId,
}: {
  medications: MedicationItem[];
  prescriptions: Prescription[];
  patientId: string;
}) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const active = medications.filter((m) => m.status !== 'deleted');
  const canManage = has(PERMISSION_KEYS.MEDICATION_MANAGE);
  const canPrescribe = has(PERMISSION_KEYS.MEDICATION_PRESCRIBE);

  function onDiscontinue(id: string) {
    startTransition(async () => {
      const result = await discontinueMedication(id, patientId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {(canManage || canPrescribe) && (
        <div className="flex justify-end gap-2">
          {canManage && <AddMedicationDialog patientId={patientId} />}
          {canPrescribe && <PrescribeDialog patientId={patientId} />}
        </div>
      )}
      {active.length === 0 ? (
        <EmptyState icon={Pill} message="No medications recorded." />
      ) : (
        <ul className="divide-y divide-border">
          {active.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Pill className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.medicationName}</div>
                <div className="text-xs text-muted-foreground">
                  {[m.dose, m.route, m.frequency].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <Badge variant={m.status === 'active' ? 'success' : 'outline'}>{m.status}</Badge>
              {canManage && !TERMINAL_STATUSES.has(m.status) && (
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onDiscontinue(m.id)}>
                  Discontinue
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <PrescriptionsList prescriptions={prescriptions} patientId={patientId} />
    </div>
  );
}
