import { callBackend } from '@/lib/api-proxy';
import { DemographicsHeader } from '@/components/chart/demographics-header';
import { ProblemsPanel } from '@/components/chart/problems-panel';
import { AllergiesPanel } from '@/components/chart/allergies-panel';
import { MedicationsPanel } from '@/components/chart/medications-panel';
import { NotesList } from '@/components/chart/notes-list';
import { ResultsList } from '@/components/chart/results-list';
import type { Patient, Problem, Allergy, MedicationItem, SignedNote, DiagnosticReport } from '@/lib/types';

export default async function PatientChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [patient, problems, allergies, medications, notes, results] = await Promise.all([
    callBackend<Patient>(`/api/v1/patients/${id}`),
    callBackend<Problem[]>(`/api/v1/patients/${id}/problems`),
    callBackend<Allergy[]>(`/api/v1/patients/${id}/allergies`),
    callBackend<MedicationItem[]>(`/api/v1/patients/${id}/medications`),
    callBackend<SignedNote[]>(`/api/v1/patients/${id}/notes`),
    callBackend<DiagnosticReport[]>(`/api/v1/patients/${id}/diagnostic-reports`),
  ]);

  return (
    <div className="space-y-6">
      <DemographicsHeader patient={patient} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProblemsPanel problems={problems} />
        <AllergiesPanel allergies={allergies} />
        <MedicationsPanel medications={medications} />
        <ResultsList reports={results} />
      </div>
      <NotesList notes={notes} />
    </div>
  );
}
