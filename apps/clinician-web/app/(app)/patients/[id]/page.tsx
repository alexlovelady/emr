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
  Appeal,
  EligibilityCheck,
  PatientLedger,
  PaymentPlan,
  PaymentPlanWithInstallments,
  Referral,
  PriorAuthorization,
  ExternalCandidate,
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
    paymentPlanRows,
    referrals,
    priorAuthorizations,
    externalCandidates,
    denials,
    appeals,
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
    callBackendOr<PaymentPlan[]>(`/api/v1/patients/${id}/payment-plans`, []),
    callBackendOr<Referral[]>(`/api/v1/patients/${id}/referrals`, []),
    callBackendOr<PriorAuthorization[]>(`/api/v1/patients/${id}/prior-authorizations`, []),
    callBackendOr<ExternalCandidate[]>(`/api/v1/patients/${id}/external-candidates`, []),
    callBackendOr<Denial[]>(`/api/v1/patients/${id}/denials`, []),
    callBackendOr<Appeal[]>(`/api/v1/patients/${id}/appeals`, []),
  ]);

  // The list endpoint returns bare plans (no installments) — same N+1-via-detail pattern as claim
  // timelines above, fine at this scale (a patient rarely has more than a couple of active plans).
  const paymentPlans = await Promise.all(
    paymentPlanRows.map((p) => callBackendOr<PaymentPlanWithInstallments | null>(`/api/v1/payment-plans/${p.id}`, null)),
  ).then((results) => results.filter((r): r is PaymentPlanWithInstallments => r !== null));

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
        appeals={appeals}
        eligibilityChecks={eligibilityChecks}
        ledger={ledger}
        paymentPlans={paymentPlans}
        referrals={referrals}
        priorAuthorizations={priorAuthorizations}
        externalCandidates={externalCandidates}
      />
    </div>
  );
}
