import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { ChargeService } from '@ehr/billing';
import { ClaimService } from '@ehr/claims';
import { LedgerService } from '@ehr/payments';
import { ClearinghouseWebhookService } from './clearinghouse-webhook.service.js';

/**
 * Exercises `ClearinghouseWebhookService` directly against a live Postgres — the owner-connection
 * tenant-resolution lookup, the domain writes, and idempotent redelivery. HMAC signature
 * verification (the HTTP-layer concern) is unit-tested in isolation in
 * `common/webhook-signature.test.ts`; unsigned/badly-signed HTTP rejection is confirmed in the
 * manual smoke walkthrough, matching how every other app in this repo verifies its auth layer.
 */
describe('ClearinghouseWebhookService', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const claimService = new ClaimService(new NoopClearinghouseGateway());
  const ledgerService = new LedgerService();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;

  async function submittedClaim(ctxA: ReturnType<typeof requestContextFor>, unitPrice = 150) {
    const charge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      chargeService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        codeSystem: 'CPT',
        code: '99213',
        description: 'Office visit, established patient, level 3',
        units: 1,
        unitPrice,
        diagnosisCodes: ['E11.9'],
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {}));
    const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        chargeIds: [charge.id],
      }),
    );
    return withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id));
  }

  function webhookService(): ClearinghouseWebhookService {
    return new ClearinghouseWebhookService(new NoopClearinghouseGateway(), handle.db, handle.ownerDb);
  }

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `WebhookGateway-${Date.now()}`,
          date_of_birth: '1983-09-14',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantAEncounterId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Webhook Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      tenantAPractitionerId = practitioner.id;
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: tenantAPatientId,
          location_id: handle.seed.tenantA.locationId,
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
          patient_id: tenantAPatientId,
          appointment_id: appointment.id,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });
  });

  afterAll(() => handle.close());

  it('resolves the tenant via the owner connection and accepts a claim on a signed 277CA', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await submittedClaim(ctxA, 100);

    const result = await webhookService().handle277ca(
      JSON.stringify({ clearinghouseTransactionId: claim.clearinghouseTransactionId, outcome: 'accepted' }),
    );
    expect(result.status).toBe('processed');

    const updated = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.getById(trx, ctxA, claim.id));
    expect(updated.status).toBe('accepted');

    const ledger = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ledgerService.getLedger(trx, ctxA, tenantAPatientId));
    expect(ledger.entries.some((e) => e.claimId === claim.id && e.entryType === 'charge' && e.amount === '100')).toBe(true);
  });

  it('is idempotent on 277CA redelivery, and does not double-post the ledger charge', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await submittedClaim(ctxA, 120);
    const body = JSON.stringify({ clearinghouseTransactionId: claim.clearinghouseTransactionId, outcome: 'accepted' });

    await webhookService().handle277ca(body);
    await expect(webhookService().handle277ca(body)).resolves.toEqual({ status: 'processed' });

    const updated = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.getById(trx, ctxA, claim.id));
    expect(updated.status).toBe('accepted');

    const ledger = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ledgerService.getLedger(trx, ctxA, tenantAPatientId));
    expect(ledger.entries.filter((e) => e.claimId === claim.id && e.entryType === 'charge')).toHaveLength(1);
  });

  it('posts a remittance and marks the claim paid on a signed 835', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await submittedClaim(ctxA, 175);
    await webhookService().handle277ca(JSON.stringify({ clearinghouseTransactionId: claim.clearinghouseTransactionId, outcome: 'accepted' }));

    const result = await webhookService().handle835(
      JSON.stringify({
        clearinghouseTransactionId: claim.clearinghouseTransactionId,
        remittanceAdviceNumber: 'RA-WEBHOOK-1',
        payerPaidAmount: 175,
      }),
    );
    expect(result.status).toBe('processed');

    const updated = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.getById(trx, ctxA, claim.id));
    expect(updated.status).toBe('paid');

    const ledger = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ledgerService.getLedger(trx, ctxA, tenantAPatientId));
    const claimEntries = ledger.entries.filter((e) => e.claimId === claim.id);
    const netForClaim = claimEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    expect(netForClaim).toBe(0); // 175 charge (on acceptance) - 175 payment (on remittance) nets to zero
  });

  it('an unknown clearinghouseTransactionId is a NotFoundError, not a crash', async () => {
    await expect(
      webhookService().handle277ca(JSON.stringify({ clearinghouseTransactionId: 'noop-claim-unknown', outcome: 'accepted' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
