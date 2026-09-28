import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { AppointmentService } from '../src/appointment/appointment.service.js';
import { ResourceService } from '../src/resource/resource.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — appointments', () => {
  let handle: TestDbHandle;
  const appointmentService = new AppointmentService();
  const resourceService = new ResourceService();
  let tenantAAppointmentId: string;
  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAResourceId: string;

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

    const resource = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      resourceService.create(trx, ctxA, { locationId: handle.seed.tenantA.locationId, name: 'Isolation Test Room', resourceType: 'room' }),
    );
    tenantAResourceId = resource.id;
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

  it('Tenant B cannot read a Tenant A resource by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => resourceService.getById(trx, ctxB, tenantAResourceId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a resources query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('resources').selectAll().where('id', '=', tenantAResourceId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects double-booking the same practitioner for an overlapping window', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const start = new Date(Date.now() + 10 * 3600_000);
    const end = new Date(start.getTime() + 1800_000);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: start,
        scheduledEnd: end,
      }),
    );
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appointmentService.create(trx, ctxA, {
          patientId: tenantAPatientId,
          locationId: handle.seed.tenantA.locationId,
          practitionerId: tenantAPractitionerId,
          appointmentType: 'office_visit',
          scheduledStart: new Date(start.getTime() + 900_000),
          scheduledEnd: new Date(end.getTime() + 900_000),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('override:true bypasses the double-booking check', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const start = new Date(Date.now() + 20 * 3600_000);
    const end = new Date(start.getTime() + 1800_000);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: start,
        scheduledEnd: end,
      }),
    );
    const overbooked = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: start,
        scheduledEnd: end,
        override: true,
      }),
    );
    expect(overbooked.status).toBe('scheduled');
  });

  it('createSeries() books every occurrence sharing one seriesId, and cancelSeries() cancels them all', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const start = new Date(Date.now() + 30 * 24 * 3600_000);
    const end = new Date(start.getTime() + 1800_000);
    const series = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.createSeries(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'pt_session',
        scheduledStart: start,
        scheduledEnd: end,
        recurrence: { frequency: 'weekly', count: 3 },
      }),
    );
    expect(series).toHaveLength(3);
    expect(new Set(series.map((a) => a.seriesId)).size).toBe(1);

    const cancelled = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.cancelSeries(trx, ctxA, series[0]!.seriesId!, 'test cleanup'),
    );
    expect(cancelled.every((a) => a.status === 'cancelled')).toBe(true);
  });

  it('waitlist() then promote() re-checks for conflicts before returning to scheduled', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const start = new Date(Date.now() + 40 * 3600_000);
    const end = new Date(start.getTime() + 1800_000);
    const appointment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: start,
        scheduledEnd: end,
      }),
    );

    const waitlisted = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.waitlist(trx, ctxA, appointment.id),
    );
    expect(waitlisted.status).toBe('waitlisted');

    const blocker = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'office_visit',
        scheduledStart: start,
        scheduledEnd: end,
        override: true,
      }),
    );

    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.promote(trx, ctxA, appointment.id)),
    ).rejects.toBeInstanceOf(ConflictError);

    await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.cancel(trx, ctxA, blocker.id, 'test cleanup'));

    const promoted = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.promote(trx, ctxA, appointment.id));
    expect(promoted.status).toBe('scheduled');
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

  it('an in_person booking (the default) never gets video join links', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const appt = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentService.getById(trx, ctxA, tenantAAppointmentId));
    expect(appt.visitType).toBe('in_person');
    expect(appt.videoJoinUrlPractitioner).toBeNull();
    expect(appt.videoJoinUrlPatient).toBeNull();
  });

  it('a telehealth booking (Tier 2 platform gap) gets real join links from the video gateway', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const start = new Date(Date.now() + 50 * 3600_000);
    const appointment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentService.create(trx, ctxA, {
        patientId: tenantAPatientId,
        locationId: handle.seed.tenantA.locationId,
        practitionerId: tenantAPractitionerId,
        appointmentType: 'telehealth_visit',
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 1800_000),
        visitType: 'telehealth',
      }),
    );
    expect(appointment.visitType).toBe('telehealth');
    expect(appointment.videoProviderVisitId).toBe(appointment.id);
    expect(appointment.videoJoinUrlPractitioner).toContain(appointment.id);
    expect(appointment.videoJoinUrlPatient).toContain(appointment.id);
    expect(appointment.videoJoinUrlPractitioner).not.toBe(appointment.videoJoinUrlPatient);
  });
});
