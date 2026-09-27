/**
 * Hand-written to match the real JSON shapes `apps/api` returns over HTTP (dates arrive as ISO
 * strings, not `Date`) — nothing in the backend is safe to import into a browser bundle (every
 * domain package pulls in `kysely`/`@ehr/db`; `packages/api-contracts` pulls in `@nestjs/common`).
 * See docs/adr/0006-clinician-web-bff-auth.md.
 */

export interface CurrentUser {
  id: string;
  tenantId: string;
  email: string;
  status: string;
  mfaEnrolled: boolean;
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface Patient {
  id: string;
  givenName: string;
  familyName: string;
  middleName?: string | null;
  dateOfBirth: string;
  sexAtBirth: string | null;
  genderIdentity?: string | null;
  phone: string | null;
  email: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
  status: string;
}

export interface DuplicateCandidate extends Patient {
  score: number;
}

export interface PatientMergeHistory {
  id: string;
  sourcePatientId: string;
  targetPatientId: string;
  mergedBy: string;
  mergeReason: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
}

export interface TimelineEntry {
  type: 'appointment' | 'task';
  occurredAt: string;
  summary: string;
  resourceId: string;
  status: string;
}

export interface PatientTimeline {
  patient: Patient;
  entries: TimelineEntry[];
}

export interface Coverage {
  id: string;
  patientId: string;
  payerName: string;
  memberId: string;
  groupNumber: string | null;
  planName: string | null;
  coverageType: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  status: string;
}

export interface PatientIdentifier {
  id: string;
  patientId: string;
  organizationId: string | null;
  identifierSystem: string;
  value: string;
  isPrimary: boolean;
  status: string;
}

export interface Problem {
  id: string;
  displayName: string;
  code: string;
  codeSystem: string;
  clinicalStatus: string;
  onsetDate: string | null;
  status: string;
}

export interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
  status: string;
}

export interface MedicationItem {
  id: string;
  medicationName: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  status: string;
}

export interface SignedNote {
  id: string;
  encounterId: string;
  noteType: string;
  signedAt: string | null;
  content: Record<string, string>;
  status: string;
}

export interface DiagnosticReport {
  id: string;
  patientId: string;
  encounterId: string;
  displayName: string;
  issuedAt: string;
  reviewStatus: string;
  criticalFlag: boolean;
  abnormalFlag: boolean;
  conclusion: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  locationId: string;
  practitionerId: string;
  appointmentType: string;
  scheduledStart: string;
  scheduledEnd: string;
  seriesId: string | null;
  status: string;
}

export interface Resource {
  id: string;
  locationId: string;
  name: string;
  resourceType: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  appointmentId: string;
  practitionerId: string;
  locationId: string;
  encounterType: string;
  chiefComplaint: string | null;
  status: 'roomed' | 'in_progress' | 'documentation' | 'signed' | 'coding_review';
  startedAt: string;
  endedAt: string | null;
}

export interface Note {
  id: string;
  encounterId: string;
  patientId: string;
  templateId: string | null;
  noteType: string;
  content: Record<string, string>;
  amendsNoteId: string | null;
  signedAt: string | null;
  signedBy: string | null;
  voidReason: string | null;
  status: 'draft' | 'ready_for_review' | 'signed' | 'voided' | 'entered_in_error';
}

export interface NoteTemplateSection {
  key: string;
  label: string;
  defaultText: string | null;
}

export interface NoteTemplate {
  id: string;
  name: string;
  sections: NoteTemplateSection[];
}

export interface Order {
  id: string;
  patientId: string;
  encounterId: string;
  orderingPractitionerId: string;
  orderType: string;
  displayName: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  medicationId: string;
  encounterId: string | null;
  prescriberId: string;
  medicationName?: string;
  pharmacyName: string;
  quantity: string;
  daysSupply: number | null;
  refillsAuthorized: number;
  refillsRemaining: number;
  directions: string;
  isControlledSubstance: boolean;
  deaSchedule: string | null;
  status: string;
}

export interface RefillRequest {
  id: string;
  prescriptionId: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface Task {
  id: string;
  patientId: string | null;
  assignedToUserId: string | null;
  assignedToRoleId: string | null;
  taskType: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'completed' | 'cancelled';
  relatedResourceType: string | null;
  relatedResourceId: string | null;
}

export interface EffectivePermissions {
  permissions: string[];
}

export interface IntakeFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select';
  required: boolean;
  options: string[] | null;
}

export interface IntakeFormTemplate {
  id: string;
  name: string;
  schemaVersion: number;
  schema: IntakeFormField[];
  status: string;
}

export interface IntakeFormResponse {
  id: string;
  templateId: string;
  patientId: string;
  appointmentId: string | null;
  answers: Record<string, unknown>;
  submittedAt: string | null;
  status: 'draft' | 'submitted';
}

export interface MessageThread {
  id: string;
  patientId: string;
  subject: string;
  createdByType: 'staff' | 'portal';
  lastMessageAt: string | null;
  status: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderType: 'staff' | 'portal';
  senderId: string;
  body: string;
  readAt: string | null;
  status: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  patientId: string | null;
  encounterId: string | null;
  documentCategory: string | null;
  status: 'pending_upload' | 'stored';
  createdAt: string;
}

export interface Charge {
  id: string;
  patientId: string;
  encounterId: string;
  billingPractitionerId: string;
  codeSystem: string;
  code: string;
  description: string;
  units: number;
  unitPrice: string;
  diagnosisCodes: string[];
  claimId: string | null;
  status: 'draft' | 'coded' | 'billed' | 'void';
  createdAt: string;
}

export interface Claim {
  id: string;
  patientId: string;
  encounterId: string;
  coverageId: string | null;
  billingPractitionerId: string;
  totalChargeAmount: string;
  currentVersion: number;
  clearinghouseTransactionId: string | null;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'adjudicated' | 'paid' | 'denied';
  createdAt: string;
}

export interface ClaimVersion {
  id: string;
  claimId: string;
  versionNumber: number;
  versionStatus: string;
  payload: Record<string, unknown>;
  clearinghouseTransactionId: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface Denial {
  id: string;
  claimId: string;
  denialReasonCode: string;
  denialReasonText: string;
  deniedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  taskId: string | null;
  status: 'open' | 'resolved';
}

export interface Remittance {
  id: string;
  claimId: string;
  claimVersionId: string;
  payerPaidAmount: string;
  adjustmentAmount: string;
  patientResponsibilityAmount: string;
  remittanceAdviceNumber: string | null;
  postedAt: string;
}

export interface FullClaimTimeline {
  claim: Claim;
  versions: ClaimVersion[];
  denials: Denial[];
  remittances: Remittance[];
}

export interface EligibilityCheck {
  id: string;
  patientId: string;
  coverageId: string;
  isEligible: boolean;
  copayAmount: string | null;
  deductibleRemaining: string | null;
  checkedAt: string;
  status: string;
}

export interface LedgerEntry {
  id: string;
  patientId: string;
  claimId: string | null;
  entryType: string;
  amount: string;
  description: string;
  occurredAt: string;
  status: string;
}

export interface PatientLedger {
  entries: LedgerEntry[];
  balance: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: unknown;
  instance?: string;
  request_id?: string;
}

export interface AiProvenance {
  model_provider: string;
  model_id: string;
  model_version: string;
  prompt_template_version: string;
  source_refs: string[];
  generated_at: string;
  output_hash: string;
  reviewer_id: string | null;
  decision: 'pending' | 'accepted' | 'accepted_with_edits' | 'rejected';
}

export interface AiGeneration {
  id: string;
  feature: string;
  patientId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  outputText: string;
  outputJson: Record<string, unknown> | null;
  status: 'pending' | 'accepted' | 'accepted_with_edits' | 'rejected';
  generatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  editedOutputText: string | null;
  provenance: AiProvenance;
}

/** The `where.all` array is an implicit-AND list — no OR/nesting exists in this DSL. */
export type CohortCondition =
  | { field: 'age'; op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'; value: number | [number, number] }
  | { concept: 'condition' | 'allergy' | 'medication'; system: string; op: 'active' | 'resolved' | 'has_code'; value: string }
  | {
      measure: 'latest_hba1c' | 'days_since_completed_encounter';
      op: '>' | '<' | '>=' | '<=' | '=';
      value: number;
    };

export interface CohortDsl {
  version: 1;
  entity: 'patient';
  where: { all: CohortCondition[] };
}

export interface CohortRow {
  id: string;
  name: string;
  description: string | null;
  dslPayload: CohortDsl;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CohortExecutionRow {
  id: string;
  cohortId: string | null;
  dslPayload: CohortDsl;
  estimatedRows: number | null;
  resultPatientIds: string[];
  resultCount: number;
  executedAt: string;
  exportStorageKey: string | null;
  status: string;
}

export interface GovernedQuery {
  name: string;
  description: string;
}

export interface SearchResult {
  resourceType: string;
  resourceId: string;
  patientId: string | null;
  title: string;
  rank: number;
  indexedAt: string;
}
