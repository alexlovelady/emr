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
  idempotency_keys: IdempotencyKeysTable;
  outbox_events: OutboxEventsTable;
  audit_events: AuditEventsTable;
}
