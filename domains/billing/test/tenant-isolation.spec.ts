import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { ChargeService } from '../src/charge/charge.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — billing', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();

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
});
