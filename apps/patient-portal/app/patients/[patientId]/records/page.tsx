import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { RecordsTabs } from '@/components/records/records-tabs';
import type { Allergy, DiagnosticReport, GenomicReport, MedicationItem, Note, Problem, ResultExplanation } from '@/lib/types';

export default async function RecordsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [results, genomicReports, notes, problems, allergies, medications] = await Promise.all([
    callBackendOr<DiagnosticReport[]>(`/api/v1/portal/patients/${patientId}/results`, []),
    callBackendOr<GenomicReport[]>(`/api/v1/portal/patients/${patientId}/genomic-reports`, []),
    callBackendOr<Note[]>(`/api/v1/portal/patients/${patientId}/notes`, []),
    callBackendOr<Problem[]>(`/api/v1/portal/patients/${patientId}/problems`, []),
    callBackendOr<Allergy[]>(`/api/v1/portal/patients/${patientId}/allergies`, []),
    callBackendOr<MedicationItem[]>(`/api/v1/portal/patients/${patientId}/medications`, []),
  ]);

  // Epic-parity item 3 — a null result here just means no staff-accepted explanation exists yet,
  // same "normal, not an error" posture as PortalChartService.getResultExplanation()'s own contract.
  const explanationEntries = await Promise.all(
    results.map(async (r) => [r.id, await callBackendOr<ResultExplanation | null>(`/api/v1/portal/patients/${patientId}/results/${r.id}/explanation`, null)] as const),
  );
  const explanations = Object.fromEntries(
    explanationEntries.filter((entry): entry is [string, ResultExplanation] => entry[1] !== null).map(([id, e]) => [id, e.explanation]),
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <RecordsTabs
          results={results}
          genomicReports={genomicReports}
          notes={notes}
          problems={problems}
          allergies={allergies}
          medications={medications}
          explanations={explanations}
        />
      </CardContent>
    </Card>
  );
}
