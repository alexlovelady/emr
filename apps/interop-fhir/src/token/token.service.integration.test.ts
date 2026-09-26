import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, DEV_SMART_CLIENT_SECRET } from '@ehr/db';
import { ForbiddenError } from '@ehr/domain-common';
import { loadOrCreateKeyMaterial, type KeyMaterial } from '@ehr/auth-adapter';
import { setupTestDb, type TestDbHandle } from '@ehr/testing';
import { PatientRepository } from '@ehr/patient';
import { toFhirPatient } from '@ehr/fhir-mapping';
import { TokenService } from './token.service.js';
import { verifySmartAccessToken } from './smart-token.js';

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
  const patientRepo = new PatientRepository();

  beforeAll(async () => {
    handle = await setupTestDb();
    keys = await loadOrCreateKeyMaterial('.dev-test/jwt-private.pem', '.dev-test/jwt-public.pem');
  });

  afterAll(() => handle.close());

  it('issues a token granting only the intersection of requested and allowed scopes', async () => {
    const service = new TokenService(handle.ownerDb, keys, TEST_ENV_CONFIG);
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
    const service = new TokenService(handle.ownerDb, keys, TEST_ENV_CONFIG);
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
    const service = new TokenService(handle.ownerDb, keys, TEST_ENV_CONFIG);
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
    const service = new TokenService(handle.ownerDb, keys, TEST_ENV_CONFIG);
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
