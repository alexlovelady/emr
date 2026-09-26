import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { ConsentService } from '../src/proxy-grant/proxy-grant.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — patient proxy grants', () => {
  let handle: TestDbHandle;
  const consentService = new ConsentService();
  let tenantAPatientId: string;
  let tenantAPortalAccountId: string;
  let tenantAActiveGrantId: string;

  async function createPatient(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: tenantId,
          given_name: 'Consent',
          family_name: `Test-${Date.now()}`,
          date_of_birth: '1990-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
  }

  async function createPortalAccount(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const account = await trx
        .insertInto('portal_accounts')
        .values({
          tenant_id: tenantId,
          email: `portal-${randomUUID()}@example.com`,
          password_hash: 'not-a-real-hash',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
  }

  beforeAll(async () => {
    handle = await setupTestDb();
    tenantAPatientId = await createPatient(handle.seed.tenantA.tenantId);
    tenantAPortalAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);

    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const grant = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      consentService.create(trx, ctxA, tenantAPatientId, {
        portalAccountId: tenantAPortalAccountId,
        relationshipType: 'guardian',
        scope: [],
      }),
    );
    tenantAActiveGrantId = grant.id;
  });

  afterAll(() => handle.close());

  it('grants access for an active, in-window grant', async () => {
    const grant = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.assertAccess(trx, handle.seed.tenantA.tenantId, tenantAPortalAccountId, tenantAPatientId),
    );
    expect(grant.id).toBe(tenantAActiveGrantId);
  });

  it('denies a portal account with no grant for the patient (404, not 403)', async () => {
    const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.assertAccess(trx, handle.seed.tenantA.tenantId, ungrantedAccountId, tenantAPatientId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('denies access once a grant is revoked', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const revokableAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const grant = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      consentService.create(trx, ctxA, tenantAPatientId, {
        portalAccountId: revokableAccountId,
        relationshipType: 'caregiver',
        scope: [],
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => consentService.revoke(trx, ctxA, grant.id, 'no longer authorized'));

    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.assertAccess(trx, handle.seed.tenantA.tenantId, revokableAccountId, tenantAPatientId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('denies access once a grant has expired (effective_end in the past)', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const expiredAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      consentService.create(trx, ctxA, tenantAPatientId, {
        portalAccountId: expiredAccountId,
        relationshipType: 'caregiver',
        scope: [],
        effectiveStart: '2000-01-01',
        effectiveEnd: '2000-06-01',
      }),
    );

    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.assertAccess(trx, handle.seed.tenantA.tenantId, expiredAccountId, tenantAPatientId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot use its own tenant id to access Tenant A grant/patient/account combination', async () => {
    await expect(
      withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
        consentService.assertAccess(trx, handle.seed.tenantB.tenantId, tenantAPortalAccountId, tenantAPatientId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B staff cannot create a proxy grant against a Tenant A patient (404, not leaked)', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        consentService.create(trx, ctxB, tenantAPatientId, {
          portalAccountId: tenantAPortalAccountId,
          relationshipType: 'guardian',
          scope: [],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects creating a grant against a nonexistent portal account', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        consentService.create(trx, ctxA, tenantAPatientId, {
          portalAccountId: randomUUID(),
          relationshipType: 'guardian',
          scope: [],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('self-grants created outside the staff API also satisfy assertAccess', async () => {
    const selfAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, tenantAPatientId, selfAccountId),
    );
    const grant = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.assertAccess(trx, handle.seed.tenantA.tenantId, selfAccountId, tenantAPatientId),
    );
    expect(grant.relationshipType).toBe('self');
  });
});
