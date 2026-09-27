import { callBackend } from '@/lib/api-proxy';
import { PatientBanner } from '@/components/chart/patient-banner';
import { ChartTabs } from '@/components/chart/chart-tabs';
import type { Patient, Problem, Allergy, MedicationItem, Prescription, SignedNote, DiagnosticReport } from '@/lib/types';

export default async function PatientChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [patient, problems, allergies, medications, prescriptions, notes, results] = await Promise.all([
    callBackend<Patient>(`/api/v1/patients/${id}`),
    callBackend<Problem[]>(`/api/v1/patients/${id}/problems`),
    callBackend<Allergy[]>(`/api/v1/patients/${id}/allergies`),
    callBackend<MedicationItem[]>(`/api/v1/patients/${id}/medications`),
    callBackend<Prescription[]>(`/api/v1/patients/${id}/prescriptions`),
    callBackend<SignedNote[]>(`/api/v1/patients/${id}/notes`),
    callBackend<DiagnosticReport[]>(`/api/v1/patients/${id}/diagnostic-reports`),
  ]);

  return (
    <div className="space-y-5">
      <PatientBanner patient={patient} allergies={allergies} />
      <ChartTabs
        patientId={id}
        problems={problems}
        allergies={allergies}
        medications={medications}
        prescriptions={prescriptions}
        results={results}
        notes={notes}
      />
    </div>
  );
}
