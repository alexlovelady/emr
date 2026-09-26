import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { ChargeService } from '@ehr/billing';
import { ClaimService } from '@ehr/claims';
import { RemittanceService } from '../src/remittance/remittance.service.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { EligibilityService } from '../src/eligibility/eligibility.service.js';
import { ClaimTimelineService } from '../src/claim-timeline/claim-timeline.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — payments', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const claimService = new ClaimService(new NoopClearinghouseGateway());
  const remittanceService = new RemittanceService(claimService);
  const ledgerService = new LedgerService();
  const eligibilityService = new EligibilityService(new NoopClearinghouseGateway());
  const timelineService = new ClaimTimelineService(claimService, remittanceService);

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;
  let tenantACoverageId: string;

  async function acceptedClaim(handleRef: TestDbHandle, ctxA: ReturnType<typeof requestContextFor>, unitPrice = 150) {
    const charge = await withTenantContext(handleRef.db, ctxA.tenantId, (trx) =>
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
    await withTenantContext(handleRef.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {}));
    const claim = await withTenantContext(handleRef.db, ctxA.tenantId, (trx) =>
      claimService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        coverageId: tenantACoverageId,
        chargeIds: [charge.id],
      }),
    );
    await withTenantContext(handleRef.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id));
    return withTenantContext(handleRef.db, ctxA.tenantId, (trx) => claimService.recordAcknowledgement(trx, ctxA, claim.id, 'accepted', null));
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
          family_name: `Payments-${Date.now()}`,
          date_of_birth: '1988-05-23',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantACoverageId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const coverage = await trx
        .insertInto('coverages')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: tenantAPatientId,
          payer_name: 'Acme Payer',
          member_id: 'M-12345',
          coverage_type: 'primary',
          effective_start: '2024-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return coverage.id;
    });

    tenantAEncounterId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({
          tenant_id: ctxA.tenantId,
          user_id: handle.seed.tenantA.adminUserId,
          organization_id: handle.seed.tenantA.organizationId,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({
          tenant_id: ctxA.tenantId,
          workforce_identity_id: workforceIdentity.id,
          display_name: 'Dr. Payments Test',
          status: 'active',
        })
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

  it('posting a full-payment remittance marks the claim paid and posts a ledger credit', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await acceptedClaim(handle, ctxA, 150);

    const remittance = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      remittanceService.post(trx, ctxA, claim.id, {
        remittanceAdviceNumber: 'RA-1001',
        payerPaidAmount: 150,
        adjustmentAmount: 0,
        patientResponsibilityAmount: 0,
        denialReasonCode: null,
        denialReasonText: null,
        rawPayload: { source: 'synthetic-835' },
      }),
    );
    expect(remittance.payerPaidAmount).toBe('150');

    const updatedClaim = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.getById(trx, ctxA, claim.id));
    expect(updatedClaim.status).toBe('paid');

    const ledger = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ledgerService.getLedger(trx, ctxA, tenantAPatientId));
    expect(ledger.entries.some((e) => e.entryType === 'payment' && e.amount === '-150')).toBe(true);
  });

  it('a redelivered remittance with the same advice number is idempotent', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await acceptedClaim(handle, ctxA, 200);
    const input = {
      remittanceAdviceNumber: 'RA-2002',
      payerPaidAmount: 200,
      adjustmentAmount: 0,
      patientResponsibilityAmount: 0,
      denialReasonCode: null,
      denialReasonText: null,
      rawPayload: { source: 'synthetic-835' },
    };
    const first = await withTenantContext(handle.db, ctxA.tenantId, (trx) => remittanceService.post(trx, ctxA, claim.id, input));
    const second = await withTenantContext(handle.db, ctxA.tenantId, (trx) => remittanceService.post(trx, ctxA, claim.id, input));
    expect(second.id).toBe(first.id);

    const remittances = await withTenantContext(handle.db, ctxA.tenantId, (trx) => remittanceService.listByClaim(trx, ctxA, claim.id));
    expect(remittances).toHaveLength(1);
  });

  it('a remittance carrying a denial code marks the claim denied and opens a Denial + Task', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const claim = await acceptedClaim(handle, ctxA, 300);

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      remittanceService.post(trx, ctxA, claim.id, {
        remittanceAdviceNumber: 'RA-3003',
        payerPaidAmount: 0,
        adjustmentAmount: 0,
        patientResponsibilityAmount: 0,
        denialReasonCode: 'CO-50',
        denialReasonText: 'Not medically necessary',
        rawPayload: { source: 'synthetic-835' },
      }),
    );

    const updatedClaim = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.getById(trx, ctxA, claim.id));
    expect(updatedClaim.status).toBe('denied');

    const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => timelineService.getTimeline(trx, ctxA, claim.id));
    expect(timeline.denials).toHaveLength(1);
    expect(timeline.denials[0]?.denialReasonCode).toBe('CO-50');
    expect(timeline.remittances).toHaveLength(1);
  });

  it('an eligibility check persists and returns the gateway synthetic result', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      eligibilityService.check(trx, ctxA, tenantAPatientId, { coverageId: tenantACoverageId }),
    );
    expect(result.isEligible).toBe(true);
    expect(result.copayAmount).toBe('25');

    const list = await withTenantContext(handle.db, ctxA.tenantId, (trx) => eligibilityService.list(trx, ctxA, tenantAPatientId));
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('Tenant B cannot read Tenant A ledger entries, and RLS blocks a raw cross-tenant query', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => ledgerService.getLedger(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      trx.selectFrom('ledger_entries').selectAll().where('patient_id', '=', tenantAPatientId).execute(),
    );
    expect(rows).toHaveLength(0);
  });
});
