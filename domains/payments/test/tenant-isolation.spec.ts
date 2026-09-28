import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { NoopPaymentGateway } from '@ehr/payment-adapter';
import { ChargeService } from '@ehr/billing';
import { ClaimService } from '@ehr/claims';
import { RemittanceService } from '../src/remittance/remittance.service.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { EligibilityService } from '../src/eligibility/eligibility.service.js';
import { ClaimTimelineService } from '../src/claim-timeline/claim-timeline.service.js';
import { PaymentService } from '../src/payment/payment.service.js';
import { PaymentPlanService } from '../src/payment-plan/payment-plan.service.js';
import { BankReconciliationService } from '../src/bank-reconciliation/bank-reconciliation.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — payments', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const claimService = new ClaimService(new NoopClearinghouseGateway());
  const remittanceService = new RemittanceService(claimService);
  const ledgerService = new LedgerService();
  const eligibilityService = new EligibilityService(new NoopClearinghouseGateway());
  const timelineService = new ClaimTimelineService(claimService, remittanceService);
  const paymentService = new PaymentService(new NoopPaymentGateway());
  const paymentPlanService = new PaymentPlanService(undefined, undefined, paymentService);
  const bankReconciliationService = new BankReconciliationService();

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
    // The scrubber requires a real eligibility check on file for an attached coverage before a
    // claim can submit — see domains/claims/src/claim/scrub-claim.ts.
    await withTenantContext(handleRef.db, ctxA.tenantId, (trx) =>
      eligibilityService.check(trx, ctxA, tenantAPatientId, { coverageId: tenantACoverageId }),
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

  it('a card payment posts a ledger entry tagged with its payment method', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentService.charge(trx, ctxA, tenantAPatientId, { method: 'card', amountCents: 5000, currency: 'usd', paymentMethodToken: 'tok_test' }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.ledgerEntry?.paymentMethod).toBe('card');
    expect(result.ledgerEntry?.amount).toBe('-50.00');
  });

  it('a check payment never calls the gateway but still posts a ledger entry with the check number', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentService.charge(trx, ctxA, tenantAPatientId, { method: 'check', amountCents: 2500, currency: 'usd', referenceNumber: 'CHK-4471' }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.transactionId).toMatch(/^manual-check-/);
    expect(result.ledgerEntry?.paymentMethod).toBe('check');
    expect(result.ledgerEntry?.paymentReference).toBe('CHK-4471');
  });

  it('creates a payment plan whose installments sum exactly to the total and are spaced by frequency', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const { plan, installments } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentPlanService.create(trx, ctxA, tenantAPatientId, { totalAmountCents: 1000, installmentCount: 3, frequency: 'weekly', startDate: '2026-01-05' }),
    );
    expect(plan.status).toBe('active');
    expect(installments).toHaveLength(3);
    const totalCents = installments.reduce((sum, i) => sum + Math.round(Number(i.amount) * 100), 0);
    expect(totalCents).toBe(1000);
    expect(installments.map((i) => i.dueDate)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
    expect(installments.every((i) => i.status === 'pending')).toBe(true);
  });

  it('paying every installment marks each paid, links its ledger entry, and completes the plan', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const { plan, installments } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentPlanService.create(trx, ctxA, tenantAPatientId, { totalAmountCents: 2000, installmentCount: 2, frequency: 'monthly', startDate: '2026-02-01' }),
    );

    const first = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentPlanService.payInstallment(trx, ctxA, plan.id, installments[0]!.id, { method: 'cash' }),
    );
    expect(first.payment.status).toBe('succeeded');
    expect(first.installment.status).toBe('paid');
    expect(first.installment.paidLedgerEntryId).toBe(first.payment.ledgerEntry?.id);
    expect(first.payment.ledgerEntry?.paymentPlanInstallmentId).toBe(installments[0]!.id);

    const midway = await withTenantContext(handle.db, ctxA.tenantId, (trx) => paymentPlanService.getWithInstallments(trx, ctxA, plan.id));
    expect(midway.plan.status).toBe('active');

    await withTenantContext(handle.db, ctxA.tenantId, (trx) => paymentPlanService.payInstallment(trx, ctxA, plan.id, installments[1]!.id, { method: 'cash' }));

    const completed = await withTenantContext(handle.db, ctxA.tenantId, (trx) => paymentPlanService.getWithInstallments(trx, ctxA, plan.id));
    expect(completed.plan.status).toBe('completed');
    expect(completed.installments.every((i) => i.status === 'paid')).toBe(true);
  });

  it('rejects paying an installment that is already paid', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const { plan, installments } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentPlanService.create(trx, ctxA, tenantAPatientId, { totalAmountCents: 500, installmentCount: 2, frequency: 'biweekly', startDate: '2026-03-01' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => paymentPlanService.payInstallment(trx, ctxA, plan.id, installments[0]!.id, { method: 'cash' }));

    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => paymentPlanService.payInstallment(trx, ctxA, plan.id, installments[0]!.id, { method: 'cash' })),
    ).rejects.toBeInstanceOf(ConflictError);
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

  it('RLS blocks a raw cross-tenant query on payment plans', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const { plan } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      paymentPlanService.create(trx, ctxA, tenantAPatientId, { totalAmountCents: 400, installmentCount: 2, frequency: 'weekly', startDate: '2026-04-01' }),
    );

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => paymentPlanService.getWithInstallments(trx, ctxB, plan.id)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) => trx.selectFrom('payment_plans').selectAll().where('id', '=', plan.id).execute());
    expect(rows).toHaveLength(0);
  });

  describe('bank reconciliation (Athelas-parity pass)', () => {
    // This dev DB is shared and never reset between test runs — every reference-number suffix
    // below is tagged with a unique-per-run id so a repeat run never collides with rows a prior run
    // already committed (bank_reference_number is exactly what real-world idempotent re-import
    // dedupes on, so a fixed literal here would make every run after the first see "already
    // imported" for the wrong reason). Same fix pattern as domains/query's search test and this
    // describe block's own uniqueAmount for auto-matching.
    const runId = Date.now();

    function bai2Today(): string {
      const now = new Date();
      const yy = String(now.getUTCFullYear()).slice(2);
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      return `${yy}${mm}${dd}`;
    }

    function buildBai2Statement(deposits: { refSuffix: string; amountCents: number }[]): string {
      const asOfDate = bai2Today();
      const txnLines = deposits.map((d) => `16,195,${d.amountCents},Z,DEP-${d.refSuffix},,Payer EFT deposit ${d.refSuffix}/`);
      const controlTotal = deposits.reduce((sum, d) => sum + d.amountCents, 0);
      return [
        '01,BANKID,CUSTID,260101,0800,1,,,2/',
        `02,CUSTID,BANKID,1,${asOfDate},,USD,/`,
        '03,1234567,USD/',
        ...txnLines,
        `49,${controlTotal},${txnLines.length + 2}/`,
        `98,${controlTotal},1,${txnLines.length + 4}/`,
        `99,${controlTotal},1,${txnLines.length + 6}/`,
      ].join('\n');
    }

    it('imports a BAI2 statement and is idempotent on a re-import of the same file', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const statement = buildBai2Statement([{ refSuffix: `IMPORT1A${runId}`, amountCents: 12345 }, { refSuffix: `IMPORT1B${runId}`, amountCents: 6789 }]);

      const first = await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.importStatement(trx, ctxA, statement));
      expect(first.imported).toBe(2);
      expect(first.skipped).toBe(0);
      expect(first.warnings).toEqual([]);

      const second = await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.importStatement(trx, ctxA, statement));
      expect(second.imported).toBe(0);
      expect(second.skipped).toBe(2);
    });

    it('auto-matches a deposit to a remittance of the same amount posted within the matching window', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      // A unique-per-run cents amount (not a round number like 150/175/200) — this dev DB is shared
      // and never reset between test runs, so common round amounts have accumulated dozens of
      // historical remittances, which would make the "exactly one candidate" auto-match assertion
      // below genuinely ambiguous. See the analogous fix in domains/query's search test.
      const uniqueAmount = 300 + (Date.now() % 9900) / 100;
      const claim = await acceptedClaim(handle, ctxA, uniqueAmount);
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        remittanceService.post(trx, ctxA, claim.id, {
          remittanceAdviceNumber: `RA-BANK-${Date.now()}`,
          payerPaidAmount: uniqueAmount,
          adjustmentAmount: 0,
          patientResponsibilityAmount: 0,
          denialReasonCode: null,
          denialReasonText: null,
          rawPayload: { source: 'synthetic-835' },
        }),
      );

      const statement = buildBai2Statement([{ refSuffix: `AUTOMATCH1${runId}`, amountCents: Math.round(uniqueAmount * 100) }]);
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.importStatement(trx, ctxA, statement));

      const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.autoMatch(trx, ctxA));
      expect(result.matched).toBeGreaterThanOrEqual(1);

      const unmatched = await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.listUnmatched(trx, ctxA));
      expect(unmatched.some((d) => d.bankReferenceNumber === `DEP-AUTOMATCH1${runId}`)).toBe(false);
    });

    it('manually matches or ignores a deposit that auto-match could not resolve', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const claim = await acceptedClaim(handle, ctxA, 250);
      const remittance = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        remittanceService.post(trx, ctxA, claim.id, {
          remittanceAdviceNumber: 'RA-BANK-2',
          payerPaidAmount: 250,
          adjustmentAmount: 0,
          patientResponsibilityAmount: 0,
          denialReasonCode: null,
          denialReasonText: null,
          rawPayload: { source: 'synthetic-835' },
        }),
      );

      const statement = buildBai2Statement([
        { refSuffix: `MANUAL1${runId}`, amountCents: 25000 },
        { refSuffix: `IGNORE1${runId}`, amountCents: 999 },
      ]);
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.importStatement(trx, ctxA, statement));

      const unmatchedBefore = await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.listUnmatched(trx, ctxA));
      const manualDeposit = unmatchedBefore.find((d) => d.bankReferenceNumber === `DEP-MANUAL1${runId}`)!;
      const ignoreDeposit = unmatchedBefore.find((d) => d.bankReferenceNumber === `DEP-IGNORE1${runId}`)!;

      const matched = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        bankReconciliationService.matchManually(trx, ctxA, manualDeposit.id, remittance.id),
      );
      expect(matched.status).toBe('matched');
      expect(matched.matchedRemittanceId).toBe(remittance.id);

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.matchManually(trx, ctxA, manualDeposit.id, remittance.id)),
      ).rejects.toBeInstanceOf(ConflictError);

      const ignored = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        bankReconciliationService.ignore(trx, ctxA, ignoreDeposit.id, 'Bank fee reversal, not a payer deposit'),
      );
      expect(ignored.status).toBe('ignored');
    });

    it('RLS blocks a raw cross-tenant query on bank deposits', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const statement = buildBai2Statement([{ refSuffix: `RLSCHECK1${runId}`, amountCents: 4321 }]);
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => bankReconciliationService.importStatement(trx, ctxA, statement));

      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
      const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        trx.selectFrom('bank_deposits').selectAll().where('bank_reference_number', '=', `DEP-RLSCHECK1${runId}`).execute(),
      );
      expect(rows).toHaveLength(0);
    });
  });
});
