import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import { LoginSchema, RefreshSchema, MfaChallengeSchema } from '../src/auth/auth.dto.js';
import { CreateOrganizationSchema, CreateLocationSchema } from '@ehr/tenant';
import { CreateUserSchema, CreatePractitionerSchema } from '@ehr/workforce';
import { RequestUploadSchema } from '@ehr/documents';
import {
  CreatePatientSchema,
  MergePatientsSchema,
  CreatePatientIdentifierSchema,
  CreateCoverageSchema,
} from '@ehr/patient';
import { CreateAppointmentSchema, CancelAppointmentSchema } from '@ehr/scheduling';
import { CreateTaskSchema } from '@ehr/tasks';
import {
  CreateIntakeFormTemplateSchema,
  CreateIntakeFormResponseSchema,
  SubmitIntakeFormResponseSchema,
} from '@ehr/intake';
import {
  CreateEncounterSchema,
  CreateNoteTemplateSchema,
  CreateNoteSchema,
  UpdateNoteContentSchema,
  VoidNoteSchema,
  CreateProblemSchema,
  UpdateProblemStatusSchema,
  CreateAllergySchema,
  CreateObservationSchema,
  CreateProcedureSchema,
  ImportExternalCandidatesSchema,
  ReplaceExternalCandidateSchema,
} from '@ehr/clinical';
import { CreateMedicationSchema, DiscontinueMedicationSchema, RecordReconciliationSchema } from '@ehr/medication';
import { CreateOrderSchema, CreateSpecimenSchema } from '@ehr/orders';
import { CreateDiagnosticReportSchema, ReviewDiagnosticReportSchema } from '@ehr/results';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generates docs/api/openapi.json from the same Zod schemas each controller validates requests
 * with (packages/api-contracts' ZodValidationPipe) — one source of truth, per spec §2.1's "Zod
 * at external boundaries." CI (openapi-contract-check) regenerates this and fails on any diff,
 * so the committed file can never silently drift from the actual request contracts.
 *
 * Deliberately request-body-only for now: modeling every response shape would require turning
 * each domain's *Row interface into a Zod schema too (currently TypeScript-only) — a reasonable
 * next increment, not done here. GET endpoints are listed with a generic 200 response.
 */
function schema(s: ZodSchema, name: string) {
  return zodToJsonSchema(s, name).definitions?.[name] ?? zodToJsonSchema(s);
}

const problemDetail = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: {},
    instance: { type: 'string' },
    request_id: { type: 'string' },
  },
  required: ['type', 'title', 'status'],
};

function jsonBody(s: ZodSchema, name: string) {
  return { content: { 'application/json': { schema: schema(s, name) } } };
}

const problemResponse = { description: 'Problem Details (RFC 7807)', content: { 'application/json': { schema: problemDetail } } };
const responses = (successDescription: string, successSchema?: unknown) => ({
  ...(successSchema
    ? { '200': { description: successDescription, content: { 'application/json': { schema: successSchema } } } }
    : { '200': { description: successDescription } }),
  '400': problemResponse,
  '401': problemResponse,
  '403': problemResponse,
  '404': problemResponse,
  '409': problemResponse,
  '422': problemResponse,
});

function post(summary: string, tag: string, body?: ZodSchema, bodyName?: string) {
  return {
    post: {
      summary,
      tags: [tag],
      ...(body && bodyName ? { requestBody: { required: true, ...jsonBody(body, bodyName) } } : {}),
      responses: responses('Success'),
    },
  };
}

function get(summary: string, tag: string, params: string[] = []) {
  return {
    get: {
      summary,
      tags: [tag],
      parameters: params.map((p) => ({ name: p, in: 'path', required: true, schema: { type: 'string' } })),
      responses: responses('Success'),
    },
  };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'EHR Product API',
    version: '0.1.0',
    description:
      'Phase 1 platform-foundation surface (Lane B, spec §8.2). Generated from apps/api/scripts/generate-openapi.ts — do not hand-edit docs/api/openapi.json.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/auth/login': post('Log in with tenant slug + email + password', 'Auth', LoginSchema, 'Login'),
    '/auth/refresh': post('Rotate a refresh token for a new access/refresh pair', 'Auth', RefreshSchema, 'Refresh'),
    '/auth/logout': post('Revoke a refresh token', 'Auth', RefreshSchema, 'Logout'),
    '/auth/mfa/challenge': {
      post: {
        summary: 'MFA challenge (structural stub — always 501, see ADR-0002)',
        tags: ['Auth'],
        requestBody: { required: true, ...jsonBody(MfaChallengeSchema, 'MfaChallenge') },
        responses: { '501': problemResponse },
      },
    },
    '/organizations': {
      ...post('Create an organization', 'Tenant', CreateOrganizationSchema, 'CreateOrganization'),
      ...get('List organizations in the caller’s tenant', 'Tenant'),
    },
    '/organizations/{id}': get('Get an organization by id', 'Tenant', ['id']),
    '/locations': {
      ...post('Create a location', 'Tenant', CreateLocationSchema, 'CreateLocation'),
      ...get('List locations in the caller’s tenant', 'Tenant'),
    },
    '/locations/{id}': get('Get a location by id', 'Tenant', ['id']),
    '/users': {
      ...post('Create a workforce user', 'Workforce', CreateUserSchema, 'CreateUser'),
      ...get('List users in the caller’s tenant', 'Workforce'),
    },
    '/users/{id}': get('Get a user by id', 'Workforce', ['id']),
    '/practitioners': {
      ...post('Create a practitioner (and its WorkforceIdentity link)', 'Workforce', CreatePractitionerSchema, 'CreatePractitioner'),
      ...get('List practitioners in the caller’s tenant', 'Workforce'),
    },
    '/practitioners/{id}': get('Get a practitioner by id', 'Workforce', ['id']),
    '/documents': {
      ...post('Request a presigned upload URL (optionally linked to a patient/encounter)', 'Documents', RequestUploadSchema, 'RequestUpload'),
      ...get('List documents in the caller’s tenant', 'Documents'),
    },
    '/documents/{id}/confirm': post('Confirm a completed upload', 'Documents'),
    '/documents/{id}/download-url': get('Get a presigned download URL', 'Documents', ['id']),
    '/patients': {
      ...post('Register a patient', 'Patient', CreatePatientSchema, 'CreatePatient'),
      ...get('List patients in the caller’s tenant', 'Patient'),
    },
    '/patients/duplicates': get('Search for duplicate-candidate patients (scoring only, never auto-merges)', 'Patient'),
    '/patients/{id}': get('Get a patient by id', 'Patient', ['id']),
    '/patients/{id}/merge': post('Merge a source patient into this one (reversible)', 'Patient', MergePatientsSchema, 'MergePatients'),
    '/patients/merges/{mergeId}/reverse': post('Reverse a previous patient merge', 'Patient'),
    '/patients/{id}/timeline': get('Read a patient’s timeline (appointments + tasks)', 'Patient', ['id']),
    '/patients/{patientId}/identifiers': {
      ...post('Add a patient identifier (e.g. MRN, scoped to an issuing organization)', 'Patient', CreatePatientIdentifierSchema, 'CreatePatientIdentifier'),
      ...get('List a patient’s identifiers', 'Patient', ['patientId']),
    },
    '/patients/{patientId}/coverages': {
      ...post('Add insurance coverage for a patient', 'Patient', CreateCoverageSchema, 'CreateCoverage'),
      ...get('List a patient’s coverages', 'Patient', ['patientId']),
    },
    '/appointments': {
      ...post('Book an appointment', 'Scheduling', CreateAppointmentSchema, 'CreateAppointment'),
      ...get('List appointments in the caller’s tenant', 'Scheduling'),
    },
    '/appointments/{id}': get('Get an appointment by id', 'Scheduling', ['id']),
    '/appointments/{id}/confirm': post('Confirm a scheduled appointment', 'Scheduling'),
    '/appointments/{id}/check-in': post('Check in an appointment', 'Scheduling'),
    '/appointments/{id}/cancel': post('Cancel an appointment', 'Scheduling', CancelAppointmentSchema, 'CancelAppointment'),
    '/appointments/{id}/no-show': post('Mark an appointment as a no-show', 'Scheduling'),
    '/tasks': {
      ...post('Create a task', 'Tasks', CreateTaskSchema, 'CreateTask'),
      ...get('List tasks in the caller’s tenant', 'Tasks'),
    },
    '/tasks/{id}': get('Get a task by id', 'Tasks', ['id']),
    '/tasks/{id}/complete': post('Complete a task', 'Tasks'),
    '/tasks/{id}/cancel': post('Cancel a task', 'Tasks'),
    '/intake-form-templates': {
      ...post('Create an intake form template', 'Intake', CreateIntakeFormTemplateSchema, 'CreateIntakeFormTemplate'),
      ...get('List intake form templates', 'Intake'),
    },
    '/intake-form-templates/{id}': get('Get an intake form template by id', 'Intake', ['id']),
    '/intake-form-responses': {
      ...post('Create a draft intake form response', 'Intake', CreateIntakeFormResponseSchema, 'CreateIntakeFormResponse'),
      ...get('List intake form responses', 'Intake'),
    },
    '/intake-form-responses/{id}': get('Get an intake form response by id', 'Intake', ['id']),
    '/intake-form-responses/{id}/submit': post('Submit an intake form response', 'Intake', SubmitIntakeFormResponseSchema, 'SubmitIntakeFormResponse'),
    '/encounters': {
      ...post('Create an encounter from a checked-in appointment', 'Clinical', CreateEncounterSchema, 'CreateEncounter'),
      ...get('List encounters in the caller’s tenant', 'Clinical'),
    },
    '/encounters/{id}': get('Get an encounter by id', 'Clinical', ['id']),
    '/encounters/{id}/start': post('Start an encounter (Roomed -> InProgress)', 'Clinical'),
    '/encounters/{id}/document': post('Move an encounter into documentation (InProgress -> Documentation)', 'Clinical'),
    '/encounters/{id}/sign': post('Sign an encounter (Documentation -> Signed)', 'Clinical'),
    '/encounters/{id}/send-to-coding': post('Send a signed encounter to coding review', 'Clinical'),
    '/note-templates': {
      ...post('Create a note template', 'Clinical', CreateNoteTemplateSchema, 'CreateNoteTemplate'),
      ...get('List note templates', 'Clinical'),
    },
    '/note-templates/{id}': get('Get a note template by id', 'Clinical', ['id']),
    '/notes': {
      ...post('Create a draft note (optionally seeded from a template)', 'Clinical', CreateNoteSchema, 'CreateNote'),
      ...get('List notes for an encounter', 'Clinical'),
    },
    '/notes/{id}': get('Get a note with its amendment chain', 'Clinical', ['id']),
    '/notes/{id}/content': post('Update a draft/ready-for-review note’s content', 'Clinical', UpdateNoteContentSchema, 'UpdateNoteContent'),
    '/notes/{id}/submit-for-review': post('Submit a draft note for review', 'Clinical'),
    '/notes/{id}/sign': post('Sign a note (immutable once signed)', 'Clinical'),
    '/notes/{id}/void': post('Void a note (only before it is signed)', 'Clinical', VoidNoteSchema, 'VoidNote'),
    '/notes/{id}/amend': post('Create an additive amendment to a signed note', 'Clinical'),
    '/patients/{patientId}/problems': {
      ...post('Record a problem on the patient’s problem list', 'Clinical', CreateProblemSchema, 'CreateProblem'),
      ...get('List a patient’s problems', 'Clinical', ['patientId']),
    },
    '/problems/{id}': get('Get a problem by id', 'Clinical', ['id']),
    '/problems/{id}/status': post('Update a problem’s clinical status', 'Clinical', UpdateProblemStatusSchema, 'UpdateProblemStatus'),
    '/patients/{patientId}/allergies': {
      ...post('Record an allergy on the patient', 'Clinical', CreateAllergySchema, 'CreateAllergy'),
      ...get('List a patient’s allergies', 'Clinical', ['patientId']),
    },
    '/allergies/{id}': get('Get an allergy by id', 'Clinical', ['id']),
    '/encounters/{encounterId}/observations': {
      ...post('Record an observation (e.g. a vital sign) for an encounter', 'Clinical', CreateObservationSchema, 'CreateObservation'),
      ...get('List an encounter’s observations', 'Clinical', ['encounterId']),
    },
    '/observations/{id}': get('Get an observation by id', 'Clinical', ['id']),
    '/encounters/{encounterId}/procedures': {
      ...post('Record a procedure performed during an encounter', 'Clinical', CreateProcedureSchema, 'CreateProcedure'),
      ...get('List an encounter’s procedures', 'Clinical', ['encounterId']),
    },
    '/procedures/{id}': get('Get a procedure by id', 'Clinical', ['id']),
    '/patients/{patientId}/medications': {
      ...post('Add a medication to the patient’s medication list', 'Medication', CreateMedicationSchema, 'CreateMedication'),
      ...get('List a patient’s medications', 'Medication', ['patientId']),
    },
    '/medications/{id}': get('Get a medication by id', 'Medication', ['id']),
    '/medications/{id}/discontinue': post('Discontinue a medication', 'Medication', DiscontinueMedicationSchema, 'DiscontinueMedication'),
    '/patients/{patientId}/medication-reconciliations': {
      ...post('Record a medication reconciliation event', 'Medication', RecordReconciliationSchema, 'RecordReconciliation'),
      ...get('List a patient’s medication reconciliation events', 'Medication', ['patientId']),
    },
    '/orders': {
      ...post('Place an order (ServiceRequest)', 'Orders', CreateOrderSchema, 'CreateOrder'),
      ...get('List orders in the caller’s tenant', 'Orders'),
    },
    '/orders/{id}': get('Get an order by id', 'Orders', ['id']),
    '/orders/{id}/cancel': post('Cancel an order', 'Orders'),
    '/orders/{orderId}/specimens': {
      ...post('Record a collected specimen for an order', 'Orders', CreateSpecimenSchema, 'CreateSpecimen'),
      ...get('List an order’s specimens', 'Orders', ['orderId']),
    },
    '/patients/{patientId}/diagnostic-reports': {
      ...post('Create a diagnostic report (with its result values)', 'Results', CreateDiagnosticReportSchema, 'CreateDiagnosticReport'),
      ...get('List a patient’s diagnostic reports', 'Results', ['patientId']),
    },
    '/diagnostic-reports/{id}': get('Get a diagnostic report by id', 'Results', ['id']),
    '/diagnostic-reports/{id}/review': post('Review/acknowledge a diagnostic report', 'Results', ReviewDiagnosticReportSchema, 'ReviewDiagnosticReport'),
    '/diagnostic-reports/{id}/amend': post('Create an additive amendment to a diagnostic report', 'Results', CreateDiagnosticReportSchema, 'AmendDiagnosticReport'),
    '/results/inbox': get('List unreviewed diagnostic reports (the result inbox)', 'Results'),
    '/patients/{patientId}/external-candidates/import': post(
      'Import external-record reconciliation candidates (from C-CDA/FHIR/HL7)',
      'ExternalCandidates',
      ImportExternalCandidatesSchema,
      'ImportExternalCandidates',
    ),
    '/patients/{patientId}/external-candidates': get('List a patient’s external-record candidates', 'ExternalCandidates', ['patientId']),
    '/external-candidates/{id}': get('Get an external-record candidate by id', 'ExternalCandidates', ['id']),
    '/external-candidates/{id}/accept': post('Accept an external-record candidate into the chart', 'ExternalCandidates'),
    '/external-candidates/{id}/reject': post('Reject an external-record candidate', 'ExternalCandidates'),
    '/external-candidates/{id}/mark-duplicate': post('Mark an external-record candidate as a duplicate', 'ExternalCandidates'),
    '/external-candidates/{id}/replace': post(
      'Accept a candidate and mark the resource it corrects as superseded',
      'ExternalCandidates',
      ReplaceExternalCandidateSchema,
      'ReplaceExternalCandidate',
    ),
  },
  components: {
    schemas: { ProblemDetail: problemDetail },
  },
};

async function main(): Promise<void> {
  const outPath = path.join(__dirname, '..', '..', '..', 'docs', 'api', 'openapi.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[generate-openapi] wrote ${outPath}`);
}

main().catch((err: unknown) => {
  console.error('[generate-openapi] failed:', err);
  process.exit(1);
});
