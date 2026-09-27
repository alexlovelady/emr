'use client';

import { useRouter } from 'next/navigation';
import type { PortalAccessiblePatient } from '@/lib/types';

export function PatientSwitcher({ patients, currentPatientId }: { patients: PortalAccessiblePatient[]; currentPatientId: string }) {
  const router = useRouter();
  if (patients.length <= 1) return null;

  return (
    <select
      value={currentPatientId}
      onChange={(e) => router.push(`/patients/${e.target.value}`)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
    >
      {patients.map((p) => (
        <option key={p.patientId} value={p.patientId}>
          {p.patient.givenName} {p.patient.familyName} ({p.relationshipType})
        </option>
      ))}
    </select>
  );
}
