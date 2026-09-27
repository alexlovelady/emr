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

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: unknown;
  instance?: string;
  request_id?: string;
}
