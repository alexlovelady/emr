import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodSchema } from 'zod';
import { LoginSchema, RefreshSchema, MfaChallengeSchema, MfaConfirmSchema } from '../src/auth/auth.dto.js';
import { CreateOrganizationSchema, CreateLocationSchema } from '@ehr/tenant';
import { CreateUserSchema, CreatePractitionerSchema } from '@ehr/workforce';
import { RequestUploadSchema } from '@ehr/documents';
import {
  CreatePatientSchema,
  MergePatientsSchema,
  CreatePatientIdentifierSchema,
  CreateCoverageSchema,
} from '@ehr/patient';
import { CreateAppointmentSchema, CreateAppointmentSeriesSchema, CancelAppointmentSchema, CreateResourceSchema } from '@ehr/scheduling';
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
  CreateNoteFromPriorSchema,
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
import {
  CreateMedicationSchema,
  DiscontinueMedicationSchema,
  RecordReconciliationSchema,
  CreatePrescriptionSchema,
  DenyRefillSchema,
} from '@ehr/medication';
import { CreateOrderSchema, CreateSpecimenSchema } from '@ehr/orders';
import { CreateDiagnosticReportSchema, ReviewDiagnosticReportSchema } from '@ehr/results';
import { CreateChargeSchema, FinalizeChargeCodingSchema } from '@ehr/billing';
import { CreateClaimSchema, ResolveDenialSchema } from '@ehr/claims';
import { CreateEligibilityCheckSchema } from '@ehr/payments';
import { SaveCohortSchema, ExecuteAdHocCohortSchema } from '@ehr/query';
import { CreateProxyGrantSchema, RevokeProxyGrantSchema } from '@ehr/consent';
import { CreateMessageThreadSchema, ReplyMessageSchema } from '@ehr/messaging';
import {
  AcceptAiGenerationSchema,
  AmbientNoteDraftSchema,
  EncounterSummarySchema,
  ChartQaSchema,
  MessageDraftSchema,
  CodingSuggestionSchema,
  DenialSummarySchema,
  TaskSummarySchema,
  ProposeCohortDslSchema,
  ExecuteCohortDslSchema,
} from '@ehr/ai';

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
    '/auth/me': get('Get the caller’s own user record (no permission required beyond a valid token)', 'Auth'),
    '/auth/permissions': get('Get the caller’s own effective permission set (no permission required beyond a valid token)', 'Auth'),
    '/auth/mfa/challenge': post(
      'Complete an MFA challenge (mfaPendingToken + TOTP code) to obtain real tokens',
      'Auth',
      MfaChallengeSchema,
      'MfaChallenge',
    ),
    '/auth/mfa/enroll': post('Start TOTP enrollment for the caller (returns a secret + otpauth URI)', 'Auth'),
    '/auth/mfa/confirm': post('Confirm TOTP enrollment with a first valid code', 'Auth', MfaConfirmSchema, 'MfaConfirm'),
    '/auth/keys/rotate': post(
      'Generate a new JWT signing key and make it current (requires security.key_rotate); the outgoing key is retained so already-issued tokens keep verifying',
      'Auth',
    ),
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
      ...post('Book an appointment (optionally with resourceIds and/or an override flag)', 'Scheduling', CreateAppointmentSchema, 'CreateAppointment'),
      ...get('List appointments in the caller’s tenant (optionally filtered by patientId/practitionerId/locationId/scheduledFrom/scheduledTo)', 'Scheduling'),
    },
    '/appointments/series': post(
      'Book a recurring series of appointments sharing one seriesId',
      'Scheduling',
      CreateAppointmentSeriesSchema,
      'CreateAppointmentSeries',
    ),
    '/appointments/series/{seriesId}/cancel': post('Cancel every not-already-cancelled appointment in a series', 'Scheduling', CancelAppointmentSchema, 'CancelAppointmentSeries'),
    '/appointments/{id}': get('Get an appointment by id', 'Scheduling', ['id']),
    '/appointments/{id}/resources': get('List the resource ids booked for an appointment', 'Scheduling', ['id']),
    '/appointments/{id}/confirm': post('Confirm a scheduled appointment', 'Scheduling'),
    '/appointments/{id}/check-in': post('Check in an appointment', 'Scheduling'),
    '/appointments/{id}/cancel': post('Cancel an appointment', 'Scheduling', CancelAppointmentSchema, 'CancelAppointment'),
    '/appointments/{id}/no-show': post('Mark an appointment as a no-show', 'Scheduling'),
    '/appointments/{id}/waitlist': post('Move a scheduled/cancelled appointment onto the waitlist', 'Scheduling'),
    '/appointments/{id}/promote': post('Promote a waitlisted appointment back to scheduled (re-checks for conflicts)', 'Scheduling'),
    '/resources': {
      ...post('Create a bookable resource (room/equipment) at a location', 'Scheduling', CreateResourceSchema, 'CreateResource'),
      ...get('List resources in the caller’s tenant (optionally filtered by locationId)', 'Scheduling'),
    },
    '/resources/{id}': get('Get a resource by id', 'Scheduling', ['id']),
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
    '/notes/from-prior': post(
      'Create a draft note seeded from a prior note for the same patient (item 19 copy-forward — each copied section starts flagged for staleness tracking)',
      'Clinical',
      CreateNoteFromPriorSchema,
      'CreateNoteFromPrior',
    ),
    '/notes/{id}': get('Get a note with its amendment chain', 'Clinical', ['id']),
    '/notes/{id}/content': post('Update a draft/ready-for-review note’s content', 'Clinical', UpdateNoteContentSchema, 'UpdateNoteContent'),
    '/notes/{id}/submit-for-review': post('Submit a draft note for review', 'Clinical'),
    '/notes/{id}/sign': post('Sign a note (immutable once signed)', 'Clinical'),
    '/notes/{id}/void': post('Void a note (only before it is signed)', 'Clinical', VoidNoteSchema, 'VoidNote'),
    '/notes/{id}/amend': post('Create an additive amendment to a signed note', 'Clinical'),
    '/patients/{patientId}/notes': get('List a patient’s signed notes', 'Clinical', ['patientId']),
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
    '/patients/{patientId}/prescriptions': {
      ...post('Prescribe a non-controlled-substance medication (eRx)', 'Medication', CreatePrescriptionSchema, 'CreatePrescription'),
      ...get('List a patient’s prescriptions', 'Medication', ['patientId']),
    },
    '/patients/{patientId}/prescriptions/controlled': post(
      'Prescribe a controlled substance (eRx) — requires the elevated controlled_substance.prescribe permission',
      'Medication',
      CreatePrescriptionSchema,
      'CreateControlledPrescription',
    ),
    '/prescriptions/{id}': get('Get a prescription by id', 'Medication', ['id']),
    '/prescriptions/{id}/cancel': post('Cancel a prescription', 'Medication'),
    '/prescriptions/{id}/refill-requests': post('Log an incoming refill request for a prescription', 'Medication'),
    '/prescription-refill-requests/{id}/approve': post('Approve a pending refill request', 'Medication'),
    '/prescription-refill-requests/{id}/deny': post('Deny a pending refill request', 'Medication', DenyRefillSchema, 'DenyRefill'),
    '/erx/medications/search': get('Search the eRx vendor’s medication catalog', 'Medication'),
    '/erx/pharmacies/search': get('Search the eRx vendor’s pharmacy directory', 'Medication'),
    '/erx/formulary': get('Look up formulary coverage for a medication', 'Medication'),
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
    '/patients/{patientId}/charges': {
      ...post('Capture a charge for an encounter', 'Billing', CreateChargeSchema, 'CreateCharge'),
      ...get('List a patient’s charges', 'Billing', ['patientId']),
    },
    '/charges/{id}': get('Get a charge by id', 'Billing', ['id']),
    '/charges/{id}/finalize-coding': post(
      'Finalize a charge’s coding (coder review)',
      'Billing',
      FinalizeChargeCodingSchema,
      'FinalizeChargeCoding',
    ),
    '/coding-queue': get('List charges awaiting coder review', 'Billing'),
    '/patients/{patientId}/claims': {
      ...post('Create a claim from coded charges', 'Claims', CreateClaimSchema, 'CreateClaim'),
      ...get('List a patient’s claims', 'Claims', ['patientId']),
    },
    '/claims/{id}': get('Get a claim by id', 'Claims', ['id']),
    '/claims/{id}/submit': post('Submit a claim to the clearinghouse (runs the scrubber first)', 'Claims'),
    '/claims/{id}/timeline': get('Get a claim’s full timeline (versions, denials, remittances)', 'Claims', ['id']),
    '/claims/{claimId}/remittances': get('List remittances posted against a claim', 'Payments', ['claimId']),
    '/denials/{id}': get('Get a denial by id', 'Claims', ['id']),
    '/denials/{id}/resolve': post('Resolve a denial', 'Claims', ResolveDenialSchema, 'ResolveDenial'),
    '/patients/{patientId}/ledger': get('Get a patient’s ledger (entries + running balance)', 'Payments', ['patientId']),
    '/patients/{patientId}/eligibility-checks': {
      ...post('Run an eligibility check against the clearinghouse', 'Payments', CreateEligibilityCheckSchema, 'CreateEligibilityCheck'),
      ...get('List a patient’s eligibility check history', 'Payments', ['patientId']),
    },
    '/cohorts': {
      ...post('Save a named, reusable cohort definition', 'Query', SaveCohortSchema, 'SaveCohort'),
      ...get('List saved cohorts', 'Query'),
    },
    '/cohorts/execute': post('Compile and run an ad-hoc (unsaved) cohort DSL query', 'Query', ExecuteAdHocCohortSchema, 'ExecuteAdHocCohort'),
    '/cohorts/{id}': get('Get a saved cohort by id', 'Query', ['id']),
    '/cohorts/{id}/execute': post('Compile and run a saved cohort', 'Query'),
    '/cohorts/{id}/executions': get('List a cohort’s past executions', 'Query', ['id']),
    '/cohort-executions/{id}': get('Get a cohort execution by id', 'Query', ['id']),
    '/cohort-executions/{id}/export': post('Export a cohort execution’s patient list to CSV', 'Query'),
    '/governed-queries': get('List the catalog of governed, parameterized analyst queries', 'Query'),
    '/governed-queries/{name}/execute': post('Execute a governed query by name', 'Query'),
    '/search': get('Full-text search across indexed resources (tenant/sensitivity-scoped)', 'Query'),
    '/search/reindex': post('Reindex patients, documents, and claims for full-text search', 'Query'),
    '/terminology/search': get('Typeahead search over a loaded terminology system (ICD-10, RxNorm)', 'Terminology'),
    '/terminology/validate': get('Check whether a code exists in a loaded terminology system', 'Terminology'),
    '/patients/{patientId}/proxy-grants': {
      ...post('Grant a portal account proxy access to a patient', 'Consent', CreateProxyGrantSchema, 'CreateProxyGrant'),
      ...get('List a patient’s proxy grants', 'Consent', ['patientId']),
    },
    '/proxy-grants/{id}/revoke': post('Revoke a proxy grant', 'Consent', RevokeProxyGrantSchema, 'RevokeProxyGrant'),
    '/patients/{patientId}/message-threads': {
      ...post('Start a secure message thread with a patient', 'Messaging', CreateMessageThreadSchema, 'CreateMessageThread'),
      ...get('List a patient’s message threads', 'Messaging', ['patientId']),
    },
    '/patients/{patientId}/message-threads/{threadId}/messages': {
      ...post('Reply in a secure message thread', 'Messaging', ReplyMessageSchema, 'ReplyMessage'),
      ...get('List messages in a thread', 'Messaging', ['patientId', 'threadId']),
    },
    '/patients/{patientId}/message-threads/{threadId}/read': post('Mark a thread’s messages as read (staff side)', 'Messaging'),
    '/ai-generations/{id}': get('Get an AI generation (with its §15.4 provenance object)', 'AI', ['id']),
    '/ai-generations/{id}/accept': post('Accept an AI generation (optionally with edited output)', 'AI', AcceptAiGenerationSchema, 'AcceptAiGeneration'),
    '/ai-generations/{id}/reject': post('Reject an AI generation', 'AI'),
    '/encounters/{encounterId}/ai/note-draft': post('Propose an ambient note draft for an encounter', 'AI', AmbientNoteDraftSchema, 'AmbientNoteDraft'),
    '/encounters/{encounterId}/ai/summary': post('Propose an encounter summary draft', 'AI', EncounterSummarySchema, 'EncounterSummary'),
    '/patients/{patientId}/ai/chart-qa': post('Ask a chart Q&A question, grounded only in retrieved chart evidence', 'AI', ChartQaSchema, 'ChartQa'),
    '/message-threads/{threadId}/ai/draft-reply': post('Draft a staff reply to a secure message thread', 'AI', MessageDraftSchema, 'MessageDraft'),
    '/encounters/{encounterId}/ai/coding-suggestions': post('Propose coding suggestions for an encounter', 'AI', CodingSuggestionSchema, 'CodingSuggestion'),
    '/denials/{denialId}/ai/summary': post('Summarize a denial in plain language', 'AI', DenialSummarySchema, 'DenialSummary'),
    '/ai/task-summary': post('Summarize open tasks (assignedToUserId or patientId scoped)', 'AI', TaskSummarySchema, 'TaskSummary'),
    '/ai/cohort-dsl': post('Propose a candidate cohort DSL from a natural-language question', 'AI', ProposeCohortDslSchema, 'ProposeCohortDsl'),
    '/ai-generations/{id}/execute-cohort': post(
      'Validate and execute a proposed (or edited) cohort DSL candidate',
      'AI',
      ExecuteCohortDslSchema,
      'ExecuteCohortDsl',
    ),
    '/alerts': get('List operational alerts (requires alert.manage) — a ?status=open|resolved query filter is accepted but not shown here', 'Alerts'),
    '/alerts/{id}/resolve': post('Manually acknowledge/resolve an open alert (requires alert.manage)', 'Alerts'),
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
