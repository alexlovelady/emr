import * as argon2 from 'argon2';
import type { Kysely } from 'kysely';
import type { DB } from './types.js';

/**
 * Idempotent synthetic fixtures for local dev, CI, and packages/testing's tenant-isolation
 * harness. Names Tenant A / Tenant B deliberately match EHR_BUILD_SPEC.md §18.2's own naming for
 * the tenant-isolation tests. NEVER run against a database that could contain real PHI —
 * passwords here are fixed, publicly-known dev values.
 *
 * Lives under src/ (not a separate seeds/ package folder) so it's part of this package's normal
 * build/export — packages/testing needs to call this directly (not just via the CLI script) to
 * build its tenant-isolation harness against known fixture IDs.
 */

export const DEV_PASSWORD = 'Dev-Passw0rd!';
export const DEV_SMART_CLIENT_SECRET = 'Dev-Smart-Client-Secr3t!';
export const DEV_SMART_CLIENT_REDIRECT_URIS = ['https://example-smart-app.test/callback'];
export const DEV_SMART_CLIENT_SCOPES = [
  'patient/Patient.read',
  'patient/Observation.read',
  'patient/Encounter.read',
  'patient/Condition.read',
  'patient/AllergyIntolerance.read',
  'patient/MedicationRequest.read',
  'patient/DocumentReference.read',
  'system/*.read',
];

export const SYSTEM_ROLE_KEYS = {
  PLATFORM_ADMIN: 'platform_admin',
  STAFF: 'staff',
} as const;

/**
 * Representative permission strings from EHR_BUILD_SPEC.md §6.2, scoped to what Phase 1's
 * foundation APIs actually check. packages/authz's permission catalog must stay in sync with
 * these literal keys — there is no shared enum yet because packages/db must not depend on
 * packages/authz (authz depends on db for role/permission lookups, not the other way around).
 */
export const PERMISSION_KEYS = {
  TENANT_MANAGE: 'tenant.manage',
  ORGANIZATION_MANAGE: 'organization.manage',
  LOCATION_MANAGE: 'location.manage',
  USER_MANAGE: 'user.manage',
  PRACTITIONER_MANAGE: 'practitioner.manage',
  ROLE_MANAGE: 'role.manage',
  DOCUMENT_UPLOAD: 'document.upload',
  DOCUMENT_DOWNLOAD: 'document.download',
  AUDIT_READ: 'audit.read',
  API_MANAGE_CLIENTS: 'api.manage_clients',
  BREAKGLASS_INVOKE: 'breakglass.invoke',
  PATIENT_READ_DEMOGRAPHICS: 'patient.read.demographics',
  PATIENT_WRITE_DEMOGRAPHICS: 'patient.write.demographics',
  PATIENT_MERGE: 'patient.merge',
  COVERAGE_MANAGE: 'coverage.manage',
  APPOINTMENT_MANAGE: 'appointment.manage',
  TASK_MANAGE: 'task.manage',
  INTAKE_FORM_MANAGE: 'intake_form.manage',
  INTAKE_RESPONSE_MANAGE: 'intake_response.manage',
  PATIENT_READ_CLINICAL: 'patient.read.clinical',
  ENCOUNTER_CREATE: 'encounter.create',
  ENCOUNTER_SIGN: 'encounter.sign',
  NOTE_CREATE: 'note.create',
  NOTE_SIGN: 'note.sign',
  PROBLEM_MANAGE: 'problem.manage',
  ALLERGY_MANAGE: 'allergy.manage',
  MEDICATION_MANAGE: 'medication.manage',
  MEDICATION_PRESCRIBE: 'medication.prescribe',
  CONTROLLED_SUBSTANCE_PRESCRIBE: 'controlled_substance.prescribe',
  OBSERVATION_MANAGE: 'observation.manage',
  PROCEDURE_MANAGE: 'procedure.manage',
  ORDER_MANAGE: 'order.manage',
  RESULT_MANAGE: 'result.manage',
  RESULT_REVIEW: 'result.review',
  INTEROP_HL7_INGEST: 'interop.hl7.ingest',
  EXTERNAL_CANDIDATE_MANAGE: 'external_candidate.manage',
  CHARGE_CAPTURE: 'charge.capture',
  CODING_REVIEW: 'coding.review',
  CLAIM_EDIT: 'claim.edit',
  CLAIM_SUBMIT: 'claim.submit',
  DENIAL_MANAGE: 'denial.manage',
  LEDGER_READ: 'ledger.read',
  PAYMENT_RECORD: 'payment.record',
  BANK_RECONCILIATION_MANAGE: 'bank_reconciliation.manage',
  BILLING_RULE_MANAGE: 'billing_rule.manage',
  REFERRAL_MANAGE: 'referral.manage',
  PRIOR_AUTH_MANAGE: 'prior_auth.manage',
  ELIGIBILITY_CHECK: 'eligibility.check',
  COHORT_MANAGE: 'cohort.manage',
  REPORT_QUERY_POPULATION: 'report.query.population',
  SEARCH_REINDEX: 'search.reindex',
  PROXY_GRANT_MANAGE: 'proxy_grant.manage',
  MESSAGE_MANAGE: 'message.manage',
  AI_GENERATION_MANAGE: 'ai_generation.manage',
} as const;

export interface SeededTenant {
  tenantId: string;
  slug: string;
  organizationId: string;
  locationId: string;
  adminUserId: string;
  adminEmail: string;
  staffUserId: string;
  staffEmail: string;
  smartClientId: string;
}

export interface SeedResult {
  tenantA: SeededTenant;
  tenantB: SeededTenant;
  roles: { platformAdminRoleId: string; staffRoleId: string };
}

/**
 * Must be called with a Kysely instance connected as the bootstrap/owner role (DATABASE_URL),
 * not the `ehr_app` role — it writes rows across two different tenants in one run, which the
 * `ehr_app` role's per-tenant RLS WITH CHECK policies would reject (no single `app.tenant_id`
 * session value applies across tenants). This is the same trust boundary migrations use.
 */
export async function seedSyntheticFixtures(db: Kysely<DB>): Promise<SeedResult> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  const smartClientSecretHash = await argon2.hash(DEV_SMART_CLIENT_SECRET, { type: argon2.argon2id });

  const platformAdminRoleId = await upsertRole(db, SYSTEM_ROLE_KEYS.PLATFORM_ADMIN, 'Platform Administrator');
  const staffRoleId = await upsertRole(db, SYSTEM_ROLE_KEYS.STAFF, 'Staff');

  await grantPermissions(db, platformAdminRoleId, Object.values(PERMISSION_KEYS));
  await grantPermissions(db, staffRoleId, [PERMISSION_KEYS.DOCUMENT_UPLOAD, PERMISSION_KEYS.DOCUMENT_DOWNLOAD]);

  const tenantA = await seedTenant(db, {
    slug: 'tenant-a',
    name: 'Tenant A Ambulatory Care',
    passwordHash,
    smartClientSecretHash,
    platformAdminRoleId,
    staffRoleId,
  });
  const tenantB = await seedTenant(db, {
    slug: 'tenant-b',
    name: 'Tenant B Family Medicine',
    passwordHash,
    smartClientSecretHash,
    platformAdminRoleId,
    staffRoleId,
  });

  return { tenantA, tenantB, roles: { platformAdminRoleId, staffRoleId } };
}

async function upsertRole(db: Kysely<DB>, key: string, displayName: string): Promise<string> {
  const row = await db
    .insertInto('roles')
    .values({ key, display_name: displayName, is_system: true })
    .onConflict((oc) => oc.column('key').doUpdateSet({ display_name: displayName }))
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function grantPermissions(db: Kysely<DB>, roleId: string, permissionKeys: string[]): Promise<void> {
  if (permissionKeys.length === 0) return;
  await db
    .insertInto('role_permissions')
    .values(permissionKeys.map((permission_key) => ({ role_id: roleId, permission_key })))
    .onConflict((oc) => oc.columns(['role_id', 'permission_key']).doNothing())
    .execute();
}

async function seedTenant(
  db: Kysely<DB>,
  opts: {
    slug: string;
    name: string;
    passwordHash: string;
    smartClientSecretHash: string;
    platformAdminRoleId: string;
    staffRoleId: string;
  },
): Promise<SeededTenant> {
  const tenant = await db
    .insertInto('tenants')
    .values({ name: opts.name, slug: opts.slug, status: 'active' })
    .onConflict((oc) => oc.column('slug').doUpdateSet({ name: opts.name }))
    .returning('id')
    .executeTakeFirstOrThrow();
  const tenantId = tenant.id;

  const org = await db
    .insertInto('organizations')
    .values({
      tenant_id: tenantId,
      name: `${opts.name} Clinic`,
      status: 'active',
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'name']).doUpdateSet({ status: 'active' }))
    .returning('id')
    .executeTakeFirstOrThrow();

  const location = await db
    .insertInto('locations')
    .values({
      tenant_id: tenantId,
      organization_id: org.id,
      name: `${opts.name} Main Office`,
      time_zone: 'America/New_York',
      status: 'active',
    })
    .onConflict((oc) => oc.columns(['organization_id', 'name']).doUpdateSet({ status: 'active' }))
    .returning('id')
    .executeTakeFirstOrThrow();

  const adminEmail = `admin@${opts.slug}.test`;
  const adminUser = await upsertUser(db, tenantId, adminEmail, opts.passwordHash);
  await grantRole(db, tenantId, adminUser, opts.platformAdminRoleId);

  const staffEmail = `staff@${opts.slug}.test`;
  const staffUser = await upsertUser(db, tenantId, staffEmail, opts.passwordHash);
  await grantRole(db, tenantId, staffUser, opts.staffRoleId);

  const smartClientId = `smart-test-client-${opts.slug}`;
  await db
    .insertInto('smart_clients')
    .values({
      tenant_id: tenantId,
      client_id: smartClientId,
      client_secret_hash: opts.smartClientSecretHash,
      display_name: `${opts.name} SMART Test Client`,
      allowed_scopes: DEV_SMART_CLIENT_SCOPES,
      redirect_uris: DEV_SMART_CLIENT_REDIRECT_URIS,
      status: 'active',
    })
    .onConflict((oc) =>
      oc.column('client_id').doUpdateSet({
        client_secret_hash: opts.smartClientSecretHash,
        allowed_scopes: DEV_SMART_CLIENT_SCOPES,
        redirect_uris: DEV_SMART_CLIENT_REDIRECT_URIS,
      }),
    )
    .execute();

  return {
    tenantId,
    slug: opts.slug,
    organizationId: org.id,
    locationId: location.id,
    adminUserId: adminUser,
    adminEmail,
    staffUserId: staffUser,
    staffEmail,
    smartClientId,
  };
}

async function upsertUser(db: Kysely<DB>, tenantId: string, email: string, passwordHash: string): Promise<string> {
  const row = await db
    .insertInto('users')
    .values({
      tenant_id: tenantId,
      email,
      password_hash: passwordHash,
      password_algo: 'argon2id',
      status: 'active',
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'email']).doUpdateSet({ password_hash: passwordHash }))
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function grantRole(db: Kysely<DB>, tenantId: string, userId: string, roleId: string): Promise<void> {
  const existing = await db
    .selectFrom('user_roles')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('role_id', '=', roleId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (existing) return;

  await db
    .insertInto('user_roles')
    .values({
      tenant_id: tenantId,
      user_id: userId,
      role_id: roleId,
      status: 'active',
    })
    .execute();
}
