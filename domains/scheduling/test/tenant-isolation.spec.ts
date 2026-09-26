import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { AppointmentService } from '../src/appointment/appointment.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — appointments', () => {
  let handle: TestDbHandle;
  const appointmentService = new AppointmentService();
  let tenantAAppointmentId: string;
  let tenantAPatientId: string;
  let tenantAPractitionerId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Test-${Date.now()}`,
          date_of_birth: '1990-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantAPractitionerId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
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
          display_name: 'Dr. Isolation Test',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return practitioner.id;
    });

    const appointment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: new Date(Date.now() + 3600_000),
        scheduledEnd: new Date(Date.now() + 7200_000),
      }),
    );
    tenantAAppointmentId = appointment.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A appointment by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => appointmentService.getById(trx, ctxB, tenantAAppointmentId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot see Tenant A appointments in list()', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const appointments = await withTenantContext(handle.db, ctxB.tenantId, (trx) => appointmentService.list(trx, ctxB));
    expect(appointments.some((a) => a.id === tenantAAppointmentId)).toBe(false);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('appointments').selectAll().where('id', '=', tenantAAppointmentId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('enforces the explicit appointment state machine', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.confirm(trx, ctxA, tenantAAppointmentId));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.confirm(trx, ctxA, tenantAAppointmentId)),
    ).rejects.toBeInstanceOf(ConflictError);
    const checkedIn = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.checkIn(trx, ctxA, tenantAAppointmentId),
    );
    expect(checkedIn.status).toBe('checked_in');
  });
});
