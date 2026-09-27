import { callBackend } from '@/lib/api-proxy';
import { PatientSearch } from '@/components/patients/patient-search';
import type { Patient } from '@/lib/types';

export default async function PatientsPage() {
  const patients = await callBackend<Patient[]>('/api/v1/patients');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <p className="text-sm text-muted-foreground">{patients.length} patients in this tenant</p>
      </div>
      <PatientSearch patients={patients} />
    </div>
  );
}
