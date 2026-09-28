/**
 * Hand-written to match the real JSON shapes `apps/api`'s /portal/* routes return over HTTP (dates
 * arrive as ISO strings, not `Date`) — mirrors apps/clinician-web's equivalent types since these are
 * the same underlying domain rows, just filtered server-side (signed notes only, released results
 * only, active problems/allergies/medications only). See docs/adr/0006-clinician-web-bff-auth.md.
 */

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

/** From `GET /api/v1/portal/patients` — the only way this app discovers which patient(s) an account may access. */
export interface PortalAccessiblePatient {
  patientId: string;
  relationshipType: string;
  patient: Patient;
}

export interface Appointment {
  id: string;
  patientId: string;
  locationId: string;
  practitionerId: string;
  appointmentType: string;
  scheduledStart: string;
  scheduledEnd: string;
  visitType: 'in_person' | 'telehealth';
  videoJoinUrlPatient: string | null;
  status: string;
}

export interface BookablePractitioner {
  id: string;
  displayName: string;
  taxonomyCode: string | null;
}

export interface BookableLocation {
  id: string;
  name: string;
  timeZone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
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

export interface Note {
  id: string;
  encounterId: string;
  patientId: string;
  noteType: string;
  content: Record<string, string>;
  signedAt: string | null;
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

export interface PortalPaymentResult {
  transactionId: string;
  status: 'succeeded' | 'failed';
  failureReason: string | null;
  ledgerEntry: LedgerEntry | null;
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

export interface ExportRequest {
  id: string;
  patientId: string;
  requestedByPortalAccountId: string;
  storageKey: string | null;
  status: string;
  createdAt: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: unknown;
  instance?: string;
  request_id?: string;
}
