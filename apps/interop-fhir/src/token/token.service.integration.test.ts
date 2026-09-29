import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { withTenantContext, DEV_SMART_CLIENT_SECRET } from '@ehr/db';
import { ForbiddenError } from '@ehr/domain-common';
import { loadOrCreateKeyMaterial, KeyRingStore, type KeyMaterial } from '@ehr/auth-adapter';
import { setupTestDb, type TestDbHandle } from '@ehr/testing';
import { PatientRepository } from '@ehr/patient';
import { toFhirPatient } from '@ehr/fhir-mapping';
import { TokenService } from './token.service.js';
import { verifySmartAccessToken } from './smart-token.js';

const REDIRECT_URI = 'https://example-smart-app.test/callback';

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

const TEST_ENV_CONFIG = { JWT_ISSUER: 'ehr-local-test', JWT_AUDIENCE: 'ehr-api-test', ACCESS_TOKEN_TTL_SECONDS: 900 };
const TEST_VERIFY_CONFIG = { issuer: TEST_ENV_CONFIG.JWT_ISSUER, audience: TEST_ENV_CONFIG.JWT_AUDIENCE };

/**
 * EHR_BUILD_SPEC.md §8.1's SMART auth requirement, exercised end to end at the service layer
 * (rather than booting a real HTTP server): client-credentials token issuance, scope
 * intersection/denial, and using the issued token's claims to fetch a tenant-scoped FHIR
 * resource — proving the same path `FhirController`/`SmartScopeGuard` use in production.
 */
describe('SMART client-credentials token issuance + scope enforcement', () => {
  let handle: TestDbHandle;
  let keys: KeyMaterial;
  let keyRingStore: KeyRingStore;
  const patientRepo = new PatientRepository();

  beforeAll(async () => {
    handle = await setupTestDb();
    keys = await loadOrCreateKeyMaterial('.dev-test/jwt-private.pem', '.dev-test/jwt-public.pem');
    keyRingStore = new KeyRingStore({ currentKid: keys.kid, keys: [{ ...keys, createdAt: new Date() }] }, '.dev-test/jwt-keyring-unused.json');
  });

  afterAll(() => handle.close());

  it('issues a token granting only the intersection of requested and allowed scopes', async () => {
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    const response = await service.issueToken({
      grant_type: 'client_credentials',
      client_id: handle.seed.tenantA.smartClientId,
      client_secret: DEV_SMART_CLIENT_SECRET,
      scope: 'patient/Patient.read patient/Observation.read patient/MedicationRequest.write',
    });

    expect(response.scope.split(' ').sort()).toEqual(['patient/Observation.read', 'patient/Patient.read']);

    const claims = await verifySmartAccessToken(response.access_token, keys.publicKey, TEST_VERIFY_CONFIG);
    expect(claims.tenantId).toBe(handle.seed.tenantA.tenantId);
    expect(claims.clientId).toBe(handle.seed.tenantA.smartClientId);
    expect(claims.scope).toContain('patient/Patient.read');
    expect(claims.scope).not.toContain('patient/MedicationRequest.write');
  });

  it('rejects an invalid client secret', async () => {
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'client_credentials',
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: 'wrong-secret',
        scope: 'patient/Patient.read',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a request for scopes the client is not allowed at all', async () => {
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'client_credentials',
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        scope: 'patient/MedicationRequest.write',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a token can fetch a FHIR Patient resource scoped to the issuing tenant, and cannot see another tenant’s patient', async () => {
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    const response = await service.issueToken({
      grant_type: 'client_credentials',
      client_id: handle.seed.tenantA.smartClientId,
      client_secret: DEV_SMART_CLIENT_SECRET,
      scope: 'patient/Patient.read',
    });
    const claims = await verifySmartAccessToken(response.access_token, keys.publicKey, TEST_VERIFY_CONFIG);
    // Simulates SmartScopeGuard's own check for a route requiring a scope the token lacks.
    expect(claims.scope.includes('patient/Observation.read')).toBe(false);

    const patientId = await withTenantContext(handle.db, claims.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: claims.tenantId,
          given_name: 'Smart',
          family_name: `Fhir-${Date.now()}`,
          date_of_birth: '1995-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    const row = await withTenantContext(handle.db, claims.tenantId, (trx) => patientRepo.findById(trx, claims.tenantId, patientId));
    expect(row).not.toBeNull();
    const fhirPatient = toFhirPatient(row!);
    expect(fhirPatient).toMatchObject({ resourceType: 'Patient', id: patientId, name: [{ family: expect.stringContaining('Fhir-') }] });

    // Tenant B's role in this assertion is implicit: RLS (already exhaustively proven by every
    // domain's own tenant-isolation suite) guarantees this row is invisible under any other
    // tenant id — re-asserted narrowly here via a wrong tenant id lookup.
    const otherTenantId = handle.seed.tenantB.tenantId;
    const rowFromWrongTenant = await withTenantContext(handle.db, otherTenantId, (trx) => patientRepo.findById(trx, otherTenantId, patientId));
    expect(rowFromWrongTenant).toBeNull();
  });
});

/**
 * The standalone-launch code exchange — `smart_authorization_codes` rows are inserted directly
 * here (mirroring how `@ehr/portal`'s `SmartLaunchService.decide()` creates one after a real
 * consent decision) rather than pulling that domain package in as a test-only dependency, since
 * `apps/interop-fhir` deliberately never depends on `@ehr/portal` in production either — see
 * `AuthorizeController`'s doc comment for the full app-boundary split.
 */
describe('SMART authorization_code grant + PKCE', () => {
  let handle: TestDbHandle;
  let keys: KeyMaterial;
  let keyRingStore: KeyRingStore;
  let patientId: string;
  let portalAccountId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    keys = await loadOrCreateKeyMaterial('.dev-test/jwt-private.pem', '.dev-test/jwt-public.pem');
    keyRingStore = new KeyRingStore({ currentKid: keys.kid, keys: [{ ...keys, createdAt: new Date() }] }, '.dev-test/jwt-keyring-unused.json');
    const ctxA = handle.seed.tenantA;

    patientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: ctxA.tenantId, given_name: 'Launch', family_name: `Test-${Date.now()}`, date_of_birth: '1988-03-03', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
    portalAccountId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const account = await trx
        .insertInto('portal_accounts')
        .values({ tenant_id: ctxA.tenantId, email: `launch-test-${Date.now()}@example.test`, password_hash: 'unused-in-this-test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
  });

  afterAll(() => handle.close());

  async function insertCode(overrides: Partial<{ codeChallenge: string; redirectUri: string; expiresAt: Date; status: string }> = {}) {
    const ctxA = handle.seed.tenantA;
    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('smart_authorization_codes')
        .values({
          tenant_id: ctxA.tenantId,
          client_id: ctxA.smartClientId,
          patient_id: patientId,
          portal_account_id: portalAccountId,
          scope: 'patient/Patient.read',
          redirect_uri: overrides.redirectUri ?? REDIRECT_URI,
          code_challenge: overrides.codeChallenge ?? challengeFor('a-real-code-verifier-with-enough-entropy-1'),
          code_challenge_method: 'S256',
          expires_at: overrides.expiresAt ?? new Date(Date.now() + 10 * 60_000),
          status: overrides.status ?? 'issued',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    return row.id;
  }

  it('exchanges a valid code for a token carrying the patient launch-context claim', async () => {
    const verifier = 'a-real-code-verifier-with-enough-entropy-1';
    const code = await insertCode({ codeChallenge: challengeFor(verifier) });
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);

    const response = await service.issueToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: handle.seed.tenantA.smartClientId,
      client_secret: DEV_SMART_CLIENT_SECRET,
      code_verifier: verifier,
    });

    expect(response.patient).toBe(patientId);
    const claims = await verifySmartAccessToken(response.access_token, keys.publicKey, TEST_VERIFY_CONFIG);
    expect(claims.patientId).toBe(patientId);
    expect(claims.scope).toEqual(['patient/Patient.read']);
  });

  it('item 24: an EHR-launch code carrying an encounter_id issues a token with the encounter launch-context claim', async () => {
    const verifier = 'a-real-code-verifier-with-enough-entropy-ehr-launch';
    const ctxA = handle.seed.tenantA;
    const encounterId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: ctxA.staffUserId, organization_id: ctxA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Token Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: patientId,
          location_id: ctxA.locationId,
          practitioner_id: practitioner.id,
          appointment_type: 'office_visit',
          scheduled_start: new Date(Date.now() + 3600_000),
          scheduled_end: new Date(Date.now() + 7200_000),
          status: 'checked_in',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const encounter = await trx
        .insertInto('encounters')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: patientId,
          appointment_id: appointment.id,
          location_id: ctxA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });

    const code = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('smart_authorization_codes')
        .values({
          tenant_id: ctxA.tenantId,
          client_id: ctxA.smartClientId,
          patient_id: patientId,
          encounter_id: encounterId,
          launched_by_user_id: ctxA.staffUserId,
          portal_account_id: null,
          scope: 'launch patient/Patient.read',
          redirect_uri: REDIRECT_URI,
          code_challenge: challengeFor(verifier),
          code_challenge_method: 'S256',
          expires_at: new Date(Date.now() + 5 * 60_000),
          status: 'issued',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    ).then((r) => r.id);

    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    const response = await service.issueToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: ctxA.smartClientId,
      client_secret: DEV_SMART_CLIENT_SECRET,
      code_verifier: verifier,
    });

    expect(response.patient).toBe(patientId);
    expect(response.encounter).toBe(encounterId);
    const claims = await verifySmartAccessToken(response.access_token, keys.publicKey, TEST_VERIFY_CONFIG);
    expect(claims.encounterId).toBe(encounterId);
  });

  it('rejects a mismatched PKCE code_verifier', async () => {
    const code = await insertCode({ codeChallenge: challengeFor('the-real-verifier') });
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        code_verifier: 'a-completely-different-verifier',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a code that has already been consumed (single-use, no replay)', async () => {
    const verifier = 'a-real-code-verifier-with-enough-entropy-2';
    const code = await insertCode({ codeChallenge: challengeFor(verifier) });
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    const exchange = () =>
      service.issueToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        code_verifier: verifier,
      });

    await expect(exchange()).resolves.toBeDefined();
    await expect(exchange()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an expired code', async () => {
    const verifier = 'a-real-code-verifier-with-enough-entropy-3';
    const code = await insertCode({ codeChallenge: challengeFor(verifier), expiresAt: new Date(Date.now() - 60_000) });
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        code_verifier: verifier,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a redirect_uri that does not match the one used to obtain the code', async () => {
    const verifier = 'a-real-code-verifier-with-enough-entropy-4';
    const code = await insertCode({ codeChallenge: challengeFor(verifier) });
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://a-different-app.test/callback',
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        code_verifier: verifier,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an unknown code', async () => {
    const service = new TokenService(handle.ownerDb, keyRingStore, TEST_ENV_CONFIG);
    await expect(
      service.issueToken({
        grant_type: 'authorization_code',
        code: randomUUID(),
        redirect_uri: REDIRECT_URI,
        client_id: handle.seed.tenantA.smartClientId,
        client_secret: DEV_SMART_CLIENT_SECRET,
        code_verifier: 'irrelevant',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
