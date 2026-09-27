import { callBackend, callBackendOr } from '@/lib/api-proxy';
import { PatientBanner } from '@/components/chart/patient-banner';
import { ChartTabs } from '@/components/chart/chart-tabs';
import type {
  Patient,
  Problem,
  Allergy,
  MedicationItem,
  Prescription,
  SignedNote,
  DiagnosticReport,
  Coverage,
  PatientIdentifier,
  IntakeFormResponse,
  IntakeFormTemplate,
  MessageThread,
  DocumentItem,
  Charge,
  Claim,
  Denial,
  EligibilityCheck,
  PatientLedger,
} from '@/lib/types';

export default async function PatientChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [
    patient,
    problems,
    allergies,
    medications,
    prescriptions,
    notes,
    results,
    coverages,
    identifiers,
    intakeResponses,
    intakeTemplates,
    messageThreads,
    documents,
    charges,
    claims,
    eligibilityChecks,
    ledger,
  ] = await Promise.all([
    callBackend<Patient>(`/api/v1/patients/${id}`),
    callBackend<Problem[]>(`/api/v1/patients/${id}/problems`),
    callBackend<Allergy[]>(`/api/v1/patients/${id}/allergies`),
    callBackend<MedicationItem[]>(`/api/v1/patients/${id}/medications`),
    callBackend<Prescription[]>(`/api/v1/patients/${id}/prescriptions`),
    callBackend<SignedNote[]>(`/api/v1/patients/${id}/notes`),
    callBackend<DiagnosticReport[]>(`/api/v1/patients/${id}/diagnostic-reports`),
    callBackendOr<Coverage[]>(`/api/v1/patients/${id}/coverages`, []),
    callBackendOr<PatientIdentifier[]>(`/api/v1/patients/${id}/identifiers`, []),
    callBackendOr<IntakeFormResponse[]>('/api/v1/intake-form-responses', [], { query: { patientId: id } }),
    callBackendOr<IntakeFormTemplate[]>('/api/v1/intake-form-templates', []),
    callBackendOr<MessageThread[]>(`/api/v1/patients/${id}/message-threads`, []),
    callBackendOr<DocumentItem[]>('/api/v1/documents', [], { query: { patientId: id } }),
    callBackendOr<Charge[]>(`/api/v1/patients/${id}/charges`, []),
    callBackendOr<Claim[]>(`/api/v1/patients/${id}/claims`, []),
    callBackendOr<EligibilityCheck[]>(`/api/v1/patients/${id}/eligibility-checks`, []),
    callBackendOr<PatientLedger | null>(`/api/v1/patients/${id}/ledger`, null),
  ]);

  // No "list denials by patient" endpoint exists — denials only surface per-claim via each
  // claim's timeline (GET /claims/:id/timeline), so derive the patient-level list from there.
  const claimTimelines = await Promise.all(
    claims.map((c) => callBackendOr<{ denials: Denial[] } | null>(`/api/v1/claims/${c.id}/timeline`, null)),
  );
  const denials = claimTimelines.flatMap((t) => t?.denials ?? []);

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
        coverages={coverages}
        identifiers={identifiers}
        intakeResponses={intakeResponses}
        intakeTemplates={intakeTemplates}
        messageThreads={messageThreads}
        documents={documents}
        charges={charges}
        claims={claims}
        denials={denials}
        eligibilityChecks={eligibilityChecks}
        ledger={ledger}
      />
    </div>
  );
}
