import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopPrescribingGateway } from '@ehr/erx-adapter';
import { MedicationService } from '../src/medication/medication.service.js';
import { MedicationReconciliationService } from '../src/reconciliation/reconciliation.service.js';
import { PrescriptionService } from '../src/prescription/prescription.service.js';
import { CreatePrescriptionSchema, type CreatePrescriptionInput } from '../src/prescription/prescription.dto.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — medications', () => {
  let handle: TestDbHandle;
  const medicationService = new MedicationService();
  const reconciliationService = new MedicationReconciliationService();
  const prescriptionService = new PrescriptionService(new NoopPrescribingGateway());
  let tenantAPatientId: string;
  let tenantAEncounterId: string;
  let tenantAPractitionerId: string;
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
      tenantAPractitionerId = practitioner.id;
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

  function ordinaryRxInput(overrides: Partial<CreatePrescriptionInput> = {}): CreatePrescriptionInput {
    return {
      encounterId: tenantAEncounterId,
      prescriberId: tenantAPractitionerId,
      medicationName: 'Amoxicillin 500 MG Oral Capsule',
      quantity: '30 capsules',
      daysSupply: 10,
      refillsAuthorized: 1,
      directions: 'Take 1 capsule by mouth three times daily',
      pharmacyNcpdpId: '1234567',
      pharmacyName: 'Synthetic Test Pharmacy #1',
      isControlledSubstance: false,
      ...overrides,
    };
  }

  it('Phase 5: creates an ordinary prescription, creating the underlying medication row too', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput(), false),
    );
    expect(prescription.status).toBe('active');
    expect(prescription.refillsRemaining).toBe(1);
    expect(prescription.gatewayReferenceId).toMatch(/^noop-rx-/);

    const medications = await withTenantContext(handle.db, ctxA.tenantId, (trx) => medicationService.list(trx, ctxA, tenantAPatientId));
    expect(medications.some((m) => m.id === prescription.medicationId)).toBe(true);
  });

  it('Phase 5: rejects a controlled-substance payload on the ordinary route', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const input = ordinaryRxInput({ isControlledSubstance: true, deaSchedule: 'IV' as const, refillsAuthorized: 0 });
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => prescriptionService.create(trx, ctxA, tenantAPatientId, input, false)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('Phase 5: rejects a non-controlled payload on the /controlled route, and accepts a real one', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput(), true)),
    ).rejects.toBeInstanceOf(ValidationError);

    const controlledInput = ordinaryRxInput({
      medicationName: 'Alprazolam 0.5 MG Oral Tablet',
      isControlledSubstance: true,
      deaSchedule: 'IV' as const,
      refillsAuthorized: 0,
    });
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, controlledInput, true),
    );
    expect(prescription.isControlledSubstance).toBe(true);
    expect(prescription.deaSchedule).toBe('IV');
  });

  it('Phase 5: rejects a Schedule II prescription with refills at the DTO layer', () => {
    const result = CreatePrescriptionSchema.safeParse(
      ordinaryRxInput({ isControlledSubstance: true, deaSchedule: 'II', refillsAuthorized: 2 }),
    );
    expect(result.success).toBe(false);
  });

  it('Phase 5: cross-tenant 404 on a prescription, and RLS blocks a raw cross-tenant query', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput(), false),
    );

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => prescriptionService.getById(trx, ctxB, prescription.id)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      trx.selectFrom('prescriptions').selectAll().where('id', '=', prescription.id).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('Phase 5: full refill request -> approve cycle resets refillsRemaining', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput({ refillsAuthorized: 2 }), false),
    );

    const refillRequest = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.requestRefill(trx, ctxA, prescription.id),
    );
    expect(refillRequest.status).toBe('pending');

    const approved = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.respondToRefill(trx, ctxA, refillRequest.id, { approved: true, denialReason: null }),
    );
    expect(approved.status).toBe('approved');

    const refreshed = await withTenantContext(handle.db, ctxA.tenantId, (trx) => prescriptionService.getById(trx, ctxA, prescription.id));
    expect(refreshed.refillsRemaining).toBe(2);
  });

  it('Phase 5: refill request -> deny cycle records a reason', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput(), false),
    );
    const refillRequest = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.requestRefill(trx, ctxA, prescription.id),
    );
    const denied = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.respondToRefill(trx, ctxA, refillRequest.id, { approved: false, denialReason: 'Patient due for follow-up first' }),
    );
    expect(denied.status).toBe('denied');
    expect(denied.denialReason).toBe('Patient due for follow-up first');
  });

  it('Phase 5: cancelling an already-cancelled prescription is a real 409', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const prescription = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      prescriptionService.create(trx, ctxA, tenantAPatientId, ordinaryRxInput(), false),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => prescriptionService.cancel(trx, ctxA, prescription.id));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => prescriptionService.cancel(trx, ctxA, prescription.id)),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
