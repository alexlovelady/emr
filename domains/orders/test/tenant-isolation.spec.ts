import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopLabOrderGateway } from '@ehr/lab-adapter';
import { OrderService } from '../src/order/order.service.js';
import { SpecimenService } from '../src/specimen/specimen.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — orders', () => {
  let handle: TestDbHandle;
  const orderService = new OrderService(new NoopLabOrderGateway());
  const specimenService = new SpecimenService();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;
  let tenantAOrderId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Order-${Date.now()}`,
          date_of_birth: '1985-04-12',
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
          display_name: 'Dr. Order Test',
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

    const order = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      orderService.create(trx, ctxA, {
        encounterId: tenantAEncounterId,
        orderingPractitionerId: tenantAPractitionerId,
        orderType: 'lab',
        codeSystem: 'LOINC',
        code: '58410-2',
        displayName: 'CBC panel',
        priority: 'routine',
      }),
    );
    tenantAOrderId = order.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A order by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => orderService.getById(trx, ctxB, tenantAOrderId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('orders').selectAll().where('id', '=', tenantAOrderId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('collects a specimen for the order and blocks cross-tenant access to it', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const specimen = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      specimenService.create(trx, ctxA, tenantAOrderId, { specimenType: 'blood' }),
    );
    expect(specimen.orderId).toBe(tenantAOrderId);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => specimenService.list(trx, ctxB, tenantAOrderId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot cancel an already-cancelled order', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => orderService.cancel(trx, ctxA, tenantAOrderId));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => orderService.cancel(trx, ctxA, tenantAOrderId)),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
