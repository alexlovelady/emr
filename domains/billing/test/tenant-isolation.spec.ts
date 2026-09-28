import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { ChargeService } from '../src/charge/charge.service.js';
import { BillingRuleService } from '../src/billing-rule/billing-rule.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — billing', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const billingRuleService = new BillingRuleService();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;
  let tenantAChargeId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Billing-${Date.now()}`,
          date_of_birth: '1982-07-19',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
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
          display_name: 'Dr. Billing Test',
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

    const charge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      chargeService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        codeSystem: 'CPT',
        code: '99213',
        description: 'Office visit, established patient, level 3',
        units: 1,
        unitPrice: 150,
        diagnosisCodes: ['E11.9'],
      }),
    );
    tenantAChargeId = charge.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A charge by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => chargeService.getById(trx, ctxB, tenantAChargeId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('charges').selectAll().where('id', '=', tenantAChargeId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('a freshly-captured charge appears in the coding queue, and drops out once coded', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const queueBefore = await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.codingQueue(trx, ctxA));
    expect(queueBefore.some((c) => c.id === tenantAChargeId)).toBe(true);

    const coded = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      chargeService.finalizeCoding(trx, ctxA, tenantAChargeId, { diagnosisCodes: ['E11.9', 'I10'] }),
    );
    expect(coded.status).toBe('coded');
    expect(coded.diagnosisCodes).toEqual(['E11.9', 'I10']);

    const queueAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.codingQueue(trx, ctxA));
    expect(queueAfter.some((c) => c.id === tenantAChargeId)).toBe(false);
  });

  it('cannot finalize coding on a charge that is not in draft status', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const charge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      chargeService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        codeSystem: 'CPT',
        code: '99214',
        description: 'Office visit, established patient, level 4',
        units: 1,
        unitPrice: 200,
        diagnosisCodes: ['I10'],
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {}));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {})),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  describe('configurable billing rules (Athelas-parity pass)', () => {
    // Rules are global/persistent per tenant (no per-test cleanup) in this shared, never-reset dev
    // DB — every test code below uses an obviously-fake, unique-per-run code so a rule created here
    // can never later interfere with a real charge or another test's charge using a real CPT code
    // like '99213'.
    const runId = Date.now();

    async function draftCharge(code: string, units = 1, diagnosisCodes: string[] = ['I10']) {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      return withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        chargeService.create(trx, ctxA, tenantAPatientId, {
          encounterId: tenantAEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          codeSystem: 'CPT',
          code,
          description: 'Billing rule test charge',
          units,
          unitPrice: 100,
          diagnosisCodes,
        }),
      );
    }

    it('blocks finalize-coding when an active code_requires_diagnosis_prefix rule is violated, and allows it once satisfied', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const code = `TESTRULE-REQDX-${runId}`;
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        billingRuleService.create(trx, ctxA, {
          ruleType: 'code_requires_diagnosis_prefix',
          description: 'Test rule: requires a Z99-prefixed diagnosis',
          parameters: { code, diagnosisPrefix: 'Z99' },
        }),
      );

      const violating = await draftCharge(code, 1, ['I10']);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, violating.id, {})),
      ).rejects.toBeInstanceOf(ValidationError);

      const satisfying = await draftCharge(code, 1, ['Z99.1']);
      const coded = await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, satisfying.id, {}));
      expect(coded.status).toBe('coded');
    });

    it('blocks finalize-coding when a code_forbidden_for_sex rule matches the patient', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const code = `TESTRULE-SEXBAN-${runId}`;

      const { malePatientId, maleEncounterId } = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const patient = await trx
          .insertInto('patients')
          .values({ tenant_id: ctxA.tenantId, given_name: 'Isolation', family_name: `BillingRuleSex-${runId}`, date_of_birth: '1975-03-10', sex_at_birth: 'M', status: 'active' })
          .returning('id')
          .executeTakeFirstOrThrow();
        const appointment = await trx
          .insertInto('appointments')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: patient.id,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
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
            patient_id: patient.id,
            appointment_id: appointment.id,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
            encounter_type: 'office_visit',
            status: 'roomed',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { malePatientId: patient.id, maleEncounterId: encounter.id };
      });

      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        billingRuleService.create(trx, ctxA, {
          ruleType: 'code_forbidden_for_sex',
          description: 'Test rule: not billable for male patients',
          parameters: { code, sex: 'M' },
        }),
      );

      const charge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        chargeService.create(trx, ctxA, malePatientId, {
          encounterId: maleEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          codeSystem: 'CPT',
          code,
          description: 'Billing rule test charge (sex ban)',
          units: 1,
          unitPrice: 100,
          diagnosisCodes: ['I10'],
        }),
      );

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {})),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks finalize-coding when a code_max_units rule is exceeded, and allows it at the limit', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const code = `TESTRULE-MAXUNITS-${runId}`;
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        billingRuleService.create(trx, ctxA, {
          ruleType: 'code_max_units',
          description: 'Test rule: max 2 units',
          parameters: { code, maxUnits: 2 },
        }),
      );

      const overLimit = await draftCharge(code, 3);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, overLimit.id, {})),
      ).rejects.toBeInstanceOf(ValidationError);

      const atLimit = await draftCharge(code, 2);
      const coded = await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, atLimit.id, {}));
      expect(coded.status).toBe('coded');
    });

    it('an inactive rule no longer blocks finalize-coding', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const code = `TESTRULE-INACTIVE-${runId}`;
      const rule = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        billingRuleService.create(trx, ctxA, {
          ruleType: 'code_max_units',
          description: 'Test rule: to be disabled',
          parameters: { code, maxUnits: 1 },
        }),
      );

      const overLimit = await draftCharge(code, 5);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, overLimit.id, {})),
      ).rejects.toBeInstanceOf(ValidationError);

      await withTenantContext(handle.db, ctxA.tenantId, (trx) => billingRuleService.updateStatus(trx, ctxA, rule.id, 'inactive'));

      const stillOverLimit = await draftCharge(code, 5);
      const coded = await withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, stillOverLimit.id, {}));
      expect(coded.status).toBe('coded');
    });

    it('Tenant B cannot see or be affected by a Tenant A billing rule', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const code = `TESTRULE-TENANTISO-${runId}`;
      const rule = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        billingRuleService.create(trx, ctxA, {
          ruleType: 'code_max_units',
          description: 'Test rule: tenant A only',
          parameters: { code, maxUnits: 1 },
        }),
      );

      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
      const rulesForB = await withTenantContext(handle.db, ctxB.tenantId, (trx) => billingRuleService.list(trx, ctxB));
      expect(rulesForB.some((r) => r.id === rule.id)).toBe(false);

      const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) => trx.selectFrom('billing_rules').selectAll().where('id', '=', rule.id).execute());
      expect(rows).toHaveLength(0);
    });
  });
});
