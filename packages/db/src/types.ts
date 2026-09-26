import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely's typed view of the schema created by packages/db/migrations. Column names are
 * snake_case (matching Postgres) on purpose — EHR_BUILD_SPEC.md prefers "explicit SQL control
 * over heavy ORM magic" (§2.1), so repositories map rows to camelCase domain objects explicitly
 * rather than relying on a runtime camelCase plugin that would hide the actual column names.
 *
 * `Generated<T>` marks columns with a DB-side default (so they're optional on insert).
 * `ColumnType<Select, Insert, Update>` marks columns whose insert/update shape differs from
 * their select shape (e.g. timestamptz columns accept a JS Date or ISO string on write, but
 * always come back as a Date on read via the `pg` driver's type parsers).
 */

type Timestamp = ColumnType<Date, Date | string, Date | string>;

/**
 * A timestamptz column with a DB-side default (`now()`), so it's optional on insert. Same
 * "don't nest Generated<> around a ColumnType" trap as GeneratedJsonColumn below — `Generated<S>`
 * treats `S` opaquely, so `Generated<Timestamp>` would wrongly select as the whole `Timestamp`
 * branded type instead of `Date`. This flattens both concerns into one ColumnType instead.
 */
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * A jsonb column: Kysely never serializes JS values for you, so Insert/Update must be a
 * pre-`JSON.stringify`'d string while Select comes back already parsed as `T` (pg's driver
 * parses jsonb automatically). NOTE: do NOT wrap this in `Generated<...>` for columns with a DB
 * default — `Generated<S>` treats `S` as one opaque value for all three positions, which breaks
 * when `S` is itself a `ColumnType`; use `GeneratedJsonColumn<T>` instead, which flattens both
 * concerns into a single ColumnType.
 */
type JsonColumn<T extends object> = ColumnType<T, string, string>;
type GeneratedJsonColumn<T extends object> = ColumnType<T, string | undefined, string>;

interface CommonColumnsTable {
  tenant_id: string;
  id: Generated<string>;
  version: Generated<string>; // bigint comes back as string from pg by default
  created_at: GeneratedTimestamp;
  created_by: string | null;
  updated_at: GeneratedTimestamp;
  updated_by: string | null;
  recorded_at: GeneratedTimestamp;
  source_type: Generated<string>;
  source_system: string | null;
  source_id: string | null;
  status: string;
  metadata: GeneratedJsonColumn<Record<string, unknown>>;
}

export interface TenantsTable {
  id: Generated<string>;
  version: Generated<string>;
  created_at: GeneratedTimestamp;
  created_by: string | null;
  updated_at: GeneratedTimestamp;
  updated_by: string | null;
  recorded_at: GeneratedTimestamp;
  source_type: Generated<string>;
  source_system: string | null;
  source_id: string | null;
  status: string;
  metadata: GeneratedJsonColumn<Record<string, unknown>>;
  name: string;
  slug: string;
}

export interface OrganizationsTable extends CommonColumnsTable {
  name: string;
  npi: string | null;
}

export interface LocationsTable extends CommonColumnsTable {
  organization_id: string;
  name: string;
  time_zone: string;
}

export interface UsersTable extends CommonColumnsTable {
  email: string;
  password_hash: string;
  password_algo: string;
  mfa_enrolled: Generated<boolean>;
  mfa_method: Generated<string>;
  last_login_at: Timestamp | null;
}

export interface WorkforceIdentitiesTable extends CommonColumnsTable {
  user_id: string;
  organization_id: string;
  employment_status: Generated<string>;
  effective_start: GeneratedTimestamp;
  effective_end: Timestamp | null;
}

export interface PractitionersTable extends CommonColumnsTable {
  workforce_identity_id: string;
  npi: string | null;
  taxonomy_code: string | null;
  display_name: string;
}

export interface PractitionerRolesTable extends CommonColumnsTable {
  practitioner_id: string;
  location_id: string;
  role_id: string;
  effective_start: GeneratedTimestamp;
  effective_end: Timestamp | null;
}

export interface RefreshTokensTable extends CommonColumnsTable {
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

/** Global system catalog — no tenant_id. Seeded, not tenant-managed, in Phase 1. */
export interface RolesTable {
  id: Generated<string>;
  key: string;
  display_name: string;
  is_system: Generated<boolean>;
  created_at: GeneratedTimestamp;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_key: string;
}

export interface UserRolesTable extends CommonColumnsTable {
  user_id: string;
  role_id: string;
  location_id: string | null;
  granted_at: GeneratedTimestamp;
  granted_by: string | null;
  revoked_at: Timestamp | null;
}

export interface DocumentsTable extends CommonColumnsTable {
  filename: string;
  content_type: string;
  size_bytes: string | null;
  storage_key: string;
  checksum_sha256: string | null;
  uploaded_by: string | null;
  patient_id: string | null;
  encounter_id: string | null;
  document_category: string | null;
}

export interface EncountersTable extends CommonColumnsTable {
  patient_id: string;
  appointment_id: string;
  location_id: string;
  practitioner_id: string;
  encounter_type: string;
  started_at: GeneratedTimestamp;
  ended_at: Timestamp | null;
  chief_complaint: string | null;
}

export interface NoteTemplatesTable extends CommonColumnsTable {
  name: string;
  schema_version: Generated<number>;
  sections: JsonColumn<NoteTemplateSection[]>;
}

export interface NoteTemplateSection {
  key: string;
  label: string;
  defaultText: string | null;
}

export interface NotesTable extends CommonColumnsTable {
  encounter_id: string;
  patient_id: string;
  template_id: string | null;
  note_type: string;
  content: GeneratedJsonColumn<Record<string, string>>;
  amends_note_id: string | null;
  signed_at: Timestamp | null;
  signed_by: string | null;
  void_reason: string | null;
}

export interface ProblemsTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string | null;
  code_system: string;
  code: string;
  display_name: string;
  clinical_status: Generated<string>;
  onset_date: Timestamp | null;
  notes: string | null;
}

export interface AllergiesTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string | null;
  substance: string;
  reaction: string | null;
  severity: string | null;
  onset_date: Timestamp | null;
  notes: string | null;
}

export interface ObservationsTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string;
  category: Generated<string>;
  code: string;
  display_name: string;
  value_quantity: string | null;
  value_text: string | null;
  unit: string | null;
  effective_at: GeneratedTimestamp;
  order_id: string | null;
  specimen_id: string | null;
}

export interface ProceduresTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string;
  code_system: string | null;
  code: string | null;
  display_name: string;
  performed_at: GeneratedTimestamp;
  notes: string | null;
}

export interface MedicationsTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string | null;
  medication_name: string;
  rxnorm_code: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  entry_source: string;
  started_at: Timestamp | null;
  stopped_at: Timestamp | null;
  prescriber_id: string | null;
  notes: string | null;
}

export interface MedicationReconciliationEventsTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string;
  performed_by: string;
  performed_at: GeneratedTimestamp;
  notes: string | null;
}

export interface PatientsTable extends CommonColumnsTable {
  given_name: string;
  family_name: string;
  middle_name: string | null;
  date_of_birth: Timestamp;
  sex_at_birth: string | null;
  gender_identity: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  preferred_language: string | null;
}

export interface PatientIdentifiersTable extends CommonColumnsTable {
  patient_id: string;
  organization_id: string | null;
  identifier_system: string;
  value: string;
  is_primary: Generated<boolean>;
}

export interface CoveragesTable extends CommonColumnsTable {
  patient_id: string;
  payer_name: string;
  member_id: string;
  group_number: string | null;
  plan_name: string | null;
  coverage_type: Generated<string>;
  effective_start: Timestamp;
  effective_end: Timestamp | null;
}

export interface PatientMergeHistoryTable extends CommonColumnsTable {
  source_patient_id: string;
  target_patient_id: string;
  merged_by: string;
  merge_reason: string | null;
  reversed_at: Timestamp | null;
  reversed_by: string | null;
}

export interface AppointmentsTable extends CommonColumnsTable {
  patient_id: string;
  location_id: string;
  practitioner_id: string;
  appointment_type: string;
  scheduled_start: Timestamp;
  scheduled_end: Timestamp;
  confirmed_at: Timestamp | null;
  checked_in_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  cancellation_reason: string | null;
  no_show_at: Timestamp | null;
}

export interface TasksTable extends CommonColumnsTable {
  patient_id: string | null;
  assigned_to_user_id: string | null;
  assigned_to_role_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  due_at: Timestamp | null;
  priority: Generated<string>;
  related_resource_type: string | null;
  related_resource_id: string | null;
  completed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
}

export interface IntakeFormTemplatesTable extends CommonColumnsTable {
  name: string;
  schema_version: Generated<number>;
  schema: JsonColumn<IntakeFormFieldDefinition[]>;
}

export interface IntakeFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select';
  required: boolean;
  options: string[] | null;
}

// Alias kept separate from the table interface so consumers can import just the field shape.
export type IntakeFormFieldDefinition = IntakeFormField;

export interface IntakeFormResponsesTable extends CommonColumnsTable {
  template_id: string;
  patient_id: string;
  appointment_id: string | null;
  answers: GeneratedJsonColumn<Record<string, unknown>>;
  submitted_at: Timestamp | null;
}

export interface OrdersTable extends CommonColumnsTable {
  patient_id: string;
  encounter_id: string;
  ordering_practitioner_id: string;
  order_type: string;
  code_system: string | null;
  code: string | null;
  display_name: string;
  priority: Generated<string>;
  ordered_at: GeneratedTimestamp;
}

export interface SpecimensTable extends CommonColumnsTable {
  order_id: string;
  specimen_type: string;
  accession_number: string | null;
  collected_at: Timestamp | null;
}

export interface DiagnosticReportsTable extends CommonColumnsTable {
  order_id: string | null;
  patient_id: string;
  encounter_id: string;
  code_system: string | null;
  code: string | null;
  display_name: string;
  conclusion: string | null;
  performing_lab: string | null;
  issued_at: GeneratedTimestamp;
  critical_flag: Generated<boolean>;
  abnormal_flag: Generated<boolean>;
  review_status: Generated<string>;
  reviewed_at: Timestamp | null;
  reviewed_by: string | null;
  amends_report_id: string | null;
}

export interface PrescriptionsTable extends CommonColumnsTable {
  patient_id: string;
  medication_id: string;
  encounter_id: string | null;
  prescriber_id: string;
  pharmacy_ncpdp_id: string;
  pharmacy_name: string;
  quantity: string;
  days_supply: number | null;
  refills_authorized: Generated<number>;
  refills_remaining: Generated<number>;
  directions: string;
  is_controlled_substance: Generated<boolean>;
  dea_schedule: string | null;
  gateway_reference_id: string | null;
  sent_at: Timestamp | null;
}

export interface PrescriptionRefillRequestsTable extends CommonColumnsTable {
  prescription_id: string;
  requested_at: GeneratedTimestamp;
  responded_at: Timestamp | null;
  responded_by: string | null;
  denial_reason: string | null;
}

export interface Hl7MessagesTable extends CommonColumnsTable {
  message_control_id: string;
  message_type: string;
  raw_message: string;
  direction: Generated<string>;
  parse_error: string | null;
  processed_at: Timestamp | null;
}

export interface ExternalCandidatesTable extends CommonColumnsTable {
  patient_id: string;
  origin_type: string;
  source_document_id: string;
  resource_type: string;
  payload: JsonColumn<Record<string, unknown>>;
  replaces_resource_id: string | null;
  created_resource_id: string | null;
  reviewed_at: Timestamp | null;
  reviewed_by: string | null;
}

export interface SmartClientsTable extends CommonColumnsTable {
  client_id: string;
  client_secret_hash: string;
  display_name: string;
  allowed_scopes: string[];
}

export interface IdempotencyKeysTable {
  tenant_id: string;
  key: string;
  request_hash: string;
  response_status: number;
  response_body: JsonColumn<Record<string, unknown>>;
  created_at: GeneratedTimestamp;
}

export interface OutboxEventsTable {
  tenant_id: string;
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string;
  occurred_at: Timestamp;
  actor_id: string | null;
  correlation_id: string;
  causation_id: string | null;
  data: JsonColumn<Record<string, unknown>>;
  status: Generated<string>;
  attempts: Generated<number>;
  published_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface AuditEventsTable {
  tenant_id: string;
  event_id: Generated<string>;
  occurred_at: Timestamp;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  patient_id: string | null;
  purpose: string | null;
  request_id: string;
  ip: string | null;
  user_agent: string | null;
  outcome: string;
  metadata: GeneratedJsonColumn<Record<string, unknown>>;
  created_at: GeneratedTimestamp;
}

export interface DB {
  tenants: TenantsTable;
  organizations: OrganizationsTable;
  locations: LocationsTable;
  users: UsersTable;
  workforce_identities: WorkforceIdentitiesTable;
  practitioners: PractitionersTable;
  practitioner_roles: PractitionerRolesTable;
  refresh_tokens: RefreshTokensTable;
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  user_roles: UserRolesTable;
  documents: DocumentsTable;
  patients: PatientsTable;
  patient_identifiers: PatientIdentifiersTable;
  coverages: CoveragesTable;
  patient_merge_history: PatientMergeHistoryTable;
  appointments: AppointmentsTable;
  tasks: TasksTable;
  intake_form_templates: IntakeFormTemplatesTable;
  intake_form_responses: IntakeFormResponsesTable;
  encounters: EncountersTable;
  note_templates: NoteTemplatesTable;
  notes: NotesTable;
  problems: ProblemsTable;
  allergies: AllergiesTable;
  observations: ObservationsTable;
  procedures: ProceduresTable;
  medications: MedicationsTable;
  medication_reconciliation_events: MedicationReconciliationEventsTable;
  prescriptions: PrescriptionsTable;
  prescription_refill_requests: PrescriptionRefillRequestsTable;
  orders: OrdersTable;
  specimens: SpecimensTable;
  diagnostic_reports: DiagnosticReportsTable;
  hl7_messages: Hl7MessagesTable;
  external_candidates: ExternalCandidatesTable;
  smart_clients: SmartClientsTable;
  idempotency_keys: IdempotencyKeysTable;
  outbox_events: OutboxEventsTable;
  audit_events: AuditEventsTable;
}
