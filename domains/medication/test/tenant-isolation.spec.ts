import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { MedicationService } from '../src/medication/medication.service.js';
import { MedicationReconciliationService } from '../src/reconciliation/reconciliation.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — medications', () => {
  let handle: TestDbHandle;
  const medicationService = new MedicationService();
  const reconciliationService = new MedicationReconciliationService();
  let tenantAPatientId: string;
  let tenantAEncounterId: string;
  let tenantAMedicationId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Medication-${Date.now()}`,
          date_of_birth: '1975-03-10',
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
          display_name: 'Dr. Medication Test',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
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

    const medication = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      medicationService.create(trx, ctxA, tenantAPatientId, {
        medicationName: 'Lisinopril',
        dose: '10mg',
        route: 'oral',
        frequency: 'once daily',
        sourceType: 'patient_reported',
      }),
    );
    tenantAMedicationId = medication.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A medication by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => medicationService.getById(trx, ctxB, tenantAMedicationId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("Tenant B cannot list Tenant A's medications for a guessed patient id", async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => medicationService.list(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('medications').selectAll().where('id', '=', tenantAMedicationId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot discontinue an already-discontinued medication', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => medicationService.discontinue(trx, ctxA, tenantAMedicationId, null));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => medicationService.discontinue(trx, ctxA, tenantAMedicationId, null)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('records a reconciliation event scoped to the tenant', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const event = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      reconciliationService.record(trx, ctxA, tenantAPatientId, { encounterId: tenantAEncounterId, notes: 'reviewed with patient' }),
    );
    expect(event.patientId).toBe(tenantAPatientId);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => reconciliationService.list(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
