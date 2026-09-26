import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import type { PaymentGateway } from '@ehr/payment-adapter';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { PortalChartService } from '../src/chart/portal-chart.service.js';
import { PortalPaymentService } from '../src/payment/portal-payment.service.js';
import { PortalSessionService } from '../src/session/portal-session.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — portal', () => {
  let handle: TestDbHandle;
  const consentService = new ConsentService();
  const fakeStorageGateway: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'k' }),
    getDownloadUrl: async () => 'https://example.test/download',
    headObject: async () => null,
    putObject: async () => ({ storageKey: `exports/${randomUUID()}.json` }),
  };
  const chartService = new PortalChartService(fakeStorageGateway);

  let tenantAPatientId: string;
  let tenantAPortalAccountId: string;

  async function createPatient(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: tenantId,
          given_name: 'Portal',
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
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, tenantAPatientId, tenantAPortalAccountId),
    );
  });

  afterAll(() => handle.close());

  it('a self-grant portal account can read its own chart (appointments, results, problems)', async () => {
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const [appointments, results, problems] = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      Promise.all([
        chartService.listAppointments(trx, ctxPortal, tenantAPatientId),
        chartService.listResults(trx, ctxPortal, tenantAPatientId),
        chartService.listProblems(trx, ctxPortal, tenantAPatientId),
      ]),
    );
    expect(appointments).toEqual([]);
    expect(results).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('a portal account with no grant for the patient is denied chart reads (404, not 403)', async () => {
    const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, ungrantedAccountId, {
      actor: { id: ungrantedAccountId, type: 'patient' },
    });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => chartService.listResults(trx, ctxPortal, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a staff token cannot be used against a portal-facing chart method', async () => {
    const ctxStaff = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => chartService.listResults(trx, ctxStaff, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot read a Tenant A patient chart even with a real Tenant A portal account id', async () => {
    const ctxCrossTenant = requestContextFor(handle.seed.tenantB.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) => chartService.listProblems(trx, ctxCrossTenant, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a successful payment posts a patient_payment ledger entry and moves the balance', async () => {
    const gateway: PaymentGateway = {
      chargeCard: async () => ({ transactionId: 'txn-test-1', status: 'succeeded', failureReason: null }),
    };
    const paymentService = new PortalPaymentService(gateway);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      paymentService.charge(trx, ctxPortal, tenantAPatientId, { amountCents: 5000, currency: 'usd', paymentMethodToken: 'tok_test' }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.ledgerEntry?.entryType).toBe('patient_payment');
    expect(result.ledgerEntry?.amount).toBe('-50.00');

    const ledger = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      chartService.getLedger(trx, ctxPortal, tenantAPatientId),
    );
    expect(Number(ledger.balance)).toBeLessThanOrEqual(-50);
  });

  it('a failed payment does not post a ledger entry', async () => {
    const gateway: PaymentGateway = {
      chargeCard: async () => ({ transactionId: 'txn-test-2', status: 'failed', failureReason: 'card_declined' }),
    };
    const paymentService = new PortalPaymentService(gateway);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      paymentService.charge(trx, ctxPortal, tenantAPatientId, { amountCents: 1000, currency: 'usd', paymentMethodToken: 'tok_bad' }),
    );
    expect(result.status).toBe('failed');
    expect(result.ledgerEntry).toBeNull();
  });

  it('a portal account can list and revoke its own sessions', async () => {
    const sessionService = new PortalSessionService();
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx
        .insertInto('portal_refresh_tokens')
        .values({
          tenant_id: handle.seed.tenantA.tenantId,
          portal_account_id: tenantAPortalAccountId,
          token_hash: `hash-${randomUUID()}`,
          expires_at: new Date(Date.now() + 3600_000),
          status: 'active',
        })
        .execute(),
    );

    const sessions = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.list(trx, ctxPortal));
    expect(sessions.length).toBeGreaterThan(0);

    const firstSession = sessions[0];
    if (!firstSession) throw new Error('expected at least one session');
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.revoke(trx, ctxPortal, firstSession.id));

    const otherAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const ctxOther = requestContextFor(handle.seed.tenantA.tenantId, otherAccountId, { actor: { id: otherAccountId, type: 'patient' } });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.revoke(trx, ctxOther, firstSession.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
