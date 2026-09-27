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
}

export interface Patient {
  id: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  sexAtBirth: string | null;
  phone: string | null;
  email: string | null;
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
  practitionerId: string;
  appointmentType: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
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

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: unknown;
  instance?: string;
  request_id?: string;
}
