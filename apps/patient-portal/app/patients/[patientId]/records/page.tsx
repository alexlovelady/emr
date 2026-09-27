import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { RecordsTabs } from '@/components/records/records-tabs';
import type { Allergy, DiagnosticReport, MedicationItem, Note, Problem } from '@/lib/types';

export default async function RecordsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [results, notes, problems, allergies, medications] = await Promise.all([
    callBackendOr<DiagnosticReport[]>(`/api/v1/portal/patients/${patientId}/results`, []),
    callBackendOr<Note[]>(`/api/v1/portal/patients/${patientId}/notes`, []),
    callBackendOr<Problem[]>(`/api/v1/portal/patients/${patientId}/problems`, []),
    callBackendOr<Allergy[]>(`/api/v1/portal/patients/${patientId}/allergies`, []),
    callBackendOr<MedicationItem[]>(`/api/v1/portal/patients/${patientId}/medications`, []),
  ]);

  return (
    <Card>
      <CardContent className="pt-6">
        <RecordsTabs results={results} notes={notes} problems={problems} allergies={allergies} medications={medications} />
      </CardContent>
    </Card>
  );
}
