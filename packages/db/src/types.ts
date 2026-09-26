import type { ColumnType, Generated, JSONColumnType } from 'kysely';

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

interface CommonColumnsTable {
  tenant_id: string;
  id: Generated<string>;
  version: Generated<string>; // bigint comes back as string from pg by default
  created_at: Generated<Timestamp>;
  created_by: string | null;
  updated_at: Generated<Timestamp>;
  updated_by: string | null;
  recorded_at: Generated<Timestamp>;
  source_type: Generated<string>;
  source_system: string | null;
  source_id: string | null;
  status: string;
  metadata: Generated<JSONColumnType<Record<string, unknown>>>;
}

export interface TenantsTable {
  id: Generated<string>;
  version: Generated<string>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
  updated_at: Generated<Timestamp>;
  updated_by: string | null;
  recorded_at: Generated<Timestamp>;
  source_type: Generated<string>;
  source_system: string | null;
  source_id: string | null;
  status: string;
  metadata: Generated<JSONColumnType<Record<string, unknown>>>;
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
  employment_status: string;
  effective_start: Timestamp;
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
  effective_start: Timestamp;
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
  created_at: Generated<Timestamp>;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_key: string;
}

export interface UserRolesTable extends CommonColumnsTable {
  user_id: string;
  role_id: string;
  location_id: string | null;
  granted_at: Generated<Timestamp>;
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
}

export interface IdempotencyKeysTable {
  tenant_id: string;
  key: string;
  request_hash: string;
  response_status: number;
  response_body: JSONColumnType<Record<string, unknown>>;
  created_at: Generated<Timestamp>;
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
  data: JSONColumnType<Record<string, unknown>>;
  status: Generated<string>;
  attempts: Generated<number>;
  published_at: Timestamp | null;
  created_at: Generated<Timestamp>;
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
  metadata: Generated<JSONColumnType<Record<string, unknown>>>;
  created_at: Generated<Timestamp>;
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
  idempotency_keys: IdempotencyKeysTable;
  outbox_events: OutboxEventsTable;
  audit_events: AuditEventsTable;
}
