import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopLabOrderGateway } from '@ehr/lab-adapter';
import { OrderService } from '@ehr/orders';
import { DiagnosticReportService } from '@ehr/results';
import { PatientRepository } from '@ehr/patient';
import { AppointmentRepository } from '@ehr/scheduling';
import { Hl7IngestionService } from './hl7.service.js';

function buildOruMessage(controlId: string, placerOrderNumber: string): string {
  return [
    `MSH|^~\\&|LAB_SYSTEM|EXTERNAL_LAB|EHR|TENANT_A|20260926120000||ORU^R01|${controlId}|P|2.5.1`,
    'PID|1||PT-9001^^^MRN||DOE^JANE||19800101|F',
    `OBR|1|${placerOrderNumber}|FILLER-500|CBC^Complete Blood Count^L||20260926110000`,
    'OBX|1|NM|2823-3^Potassium^LN||6.8|mmol/L|3.5-5.1|HH|||F',
  ].join('\r');
}

function buildAdtMessage(controlId: string, triggerEvent: string, patientId: string): string {
  return [
    `MSH|^~\\&|REG_SYSTEM|EXTERNAL_REG|EHR|TENANT_A|20260926120000||ADT^${triggerEvent}|${controlId}|P|2.5.1`,
    `PID|1||${patientId}^^^MRN||SMITH^JOHN^Q||19750615|M|||||5559876543`,
  ].join('\r');
}

function buildSiuNewMessage(controlId: string, patientId: string, practitionerId: string, locationId: string): string {
  return [
    `MSH|^~\\&|SCHED_SYSTEM|EXTERNAL_SCHED|EHR|TENANT_A|20260926120000||SIU^S12|${controlId}|P|2.5.1`,
    `SCH|||||||office_visit||||20280301090000^20280301093000`,
    `PID|1||${patientId}^^^MRN||SMITH^JOHN||19750615|M`,
    `AIP|1||${practitionerId}`,
    `AIL|1||${locationId}`,
  ].join('\r');
}

function buildSiuUpdateMessage(controlId: string, appointmentId: string): string {
  return [
    `MSH|^~\\&|SCHED_SYSTEM|EXTERNAL_SCHED|EHR|TENANT_A|20260926120000||SIU^S14|${controlId}|P|2.5.1`,
    `SCH|${appointmentId}||||||office_visit||||20280301100000^20280301103000`,
  ].join('\r');
}

function buildSiuCancelMessage(controlId: string, appointmentId: string): string {
  return [
    `MSH|^~\\&|SCHED_SYSTEM|EXTERNAL_SCHED|EHR|TENANT_A|20260926120000||SIU^S15|${controlId}|P|2.5.1`,
    `SCH|${appointmentId}`,
  ].join('\r');
}

function buildOrmMessage(controlId: string, encounterId: string, practitionerId: string): string {
  const pv1Fields = new Array(20).fill('');
  pv1Fields[0] = 'PV1';
  pv1Fields[19] = encounterId;
  const obrFields = new Array(17).fill('');
  obrFields[0] = 'OBR';
  obrFields[4] = 'BMP^Basic Metabolic Panel^L';
  obrFields[16] = practitionerId;
  return [
    `MSH|^~\\&|ORDER_SYSTEM|EXTERNAL_ORD|EHR|TENANT_A|20260926120000||ORM^O01|${controlId}|P|2.5.1`,
    pv1Fields.join('|'),
    obrFields.join('|'),
  ].join('\r');
}

/**
 * EHR_BUILD_SPEC.md §12.1's ingestion pipeline, exercised end to end: raw immutable storage,
 * order correlation via OBR-2, canonical DiagnosticReport/Observation creation, and the
 * malformed-message path that still preserves the raw bytes.
 */
describe('Hl7IngestionService — ORU^R01 ingestion', () => {
  let handle: TestDbHandle;
  const orderService = new OrderService(new NoopLabOrderGateway());
  const reportService = new DiagnosticReportService();
  const ingestionService = new Hl7IngestionService(undefined, undefined, reportService);

  let tenantAPatientId: string;
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
          family_name: `Hl7-${Date.now()}`,
          date_of_birth: '1980-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Hl7 Test', status: 'active' })
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
      const order = await orderService.create(trx, ctxA, {
        encounterId: encounter.id,
        orderingPractitionerId: practitioner.id,
        orderType: 'lab',
        codeSystem: 'LOINC',
        code: '58410-2',
        displayName: 'CBC panel',
        priority: 'routine',
      });
      tenantAOrderId = order.id;
    });
  });

  afterAll(() => handle.close());

  it('ingests a valid ORU^R01 result, correlating it to the order via OBR-2 and creating a critical DiagnosticReport', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildOruMessage(`MSG-${Date.now()}`, tenantAOrderId);

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AA');

    const reports = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.list(trx, ctxA, tenantAPatientId));
    const created = reports.find((r) => r.orderId === tenantAOrderId);
    expect(created).toBeDefined();
    expect(created?.criticalFlag).toBe(true);
    expect(created?.abnormalFlag).toBe(true);
  });

  it('is idempotent on message redelivery (same control ID is not reprocessed)', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const controlId = `MSG-DUP-${Date.now()}`;
    const message = buildOruMessage(controlId, tenantAOrderId);

    const first = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    const reportsAfterFirst = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.list(trx, ctxA, tenantAPatientId));
    const countAfterFirst = reportsAfterFirst.filter((r) => r.orderId === tenantAOrderId).length;

    const redelivered = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(redelivered.messageId).toBe(first.messageId);

    const reportsAfterRedelivery = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.list(trx, ctxA, tenantAPatientId));
    // Redelivery must not create a second report for the same message.
    expect(reportsAfterRedelivery.filter((r) => r.orderId === tenantAOrderId)).toHaveLength(countAfterFirst);
  });

  it('a message that cannot be correlated to any order is a NACK, not a crash', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildOruMessage(`MSG-UNKNOWN-${Date.now()}`, '00000000-0000-4000-8000-000000000000');

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AE');
    expect(result.detail).toMatch(/No order found/);
  });

  it('a permanent correlation failure (item 15) is dead-lettered immediately, not scheduled for retry', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildOruMessage(`MSG-DEADLETTER-${Date.now()}`, '00000000-0000-4000-8000-000000000000');

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AE');

    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx.selectFrom('hl7_messages').selectAll().where('id', '=', result.messageId).executeTakeFirstOrThrow(),
    );
    expect(row.dead_letter).toBe(true);
    expect(row.next_retry_at).toBeNull();
    expect(row.retry_count).toBe(1);
  });

  it('a genuinely malformed message is stored failed, preserving the raw text, without crashing', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const garbage = 'this is not an HL7 message at all';

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, garbage));
    expect(result.ackCode).toBe('AE');

    const rows = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx.selectFrom('hl7_messages').selectAll().where('id', '=', result.messageId).execute(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.raw_message).toBe(garbage);
    expect(rows[0]!.status).toBe('failed');
  });
});

/**
 * Phase J (eCW/athena parity roadmap): ADT/SIU/ORM dispatch, each correlated by this system's own
 * UUIDs rather than an external identifier — see `@ehr/hl7`'s doc comments for why.
 */
describe('Hl7IngestionService — ADT/SIU/ORM dispatch', () => {
  let handle: TestDbHandle;
  const ingestionService = new Hl7IngestionService();
  const patientRepo = new PatientRepository();
  const appointmentRepo = new AppointmentRepository();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Hl7Dispatch-${Date.now()}`,
          date_of_birth: '1980-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Dispatch Test', status: 'active' })
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
      tenantAEncounterId = encounter.id;
    });
  });

  afterAll(() => handle.close());

  it('ADT^A08 updates patient demographics from PID', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildAdtMessage(`ADT-${Date.now()}`, 'A08', tenantAPatientId);

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AA');

    const patient = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientRepo.findById(trx, ctxA.tenantId, tenantAPatientId));
    expect(patient?.givenName).toBe('JOHN');
    expect(patient?.familyName).toBe('SMITH');
    expect(patient?.middleName).toBe('Q');
    expect(patient?.dateOfBirth).toBe('1975-06-15');
    expect(patient?.sexAtBirth).toBe('M');
  });

  it('ADT for an unknown patient identifier is a NACK, not a crash', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildAdtMessage(`ADT-UNKNOWN-${Date.now()}`, 'A08', '00000000-0000-4000-8000-000000000000');

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AE');
    expect(result.detail).toMatch(/No patient found/);
  });

  it('SIU^S12 books a new appointment, SIU^S14 reschedules it, SIU^S15 cancels it', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    const newMessage = buildSiuNewMessage(`SIU-NEW-${Date.now()}`, tenantAPatientId, tenantAPractitionerId, handle.seed.tenantA.locationId);
    const newResult = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, newMessage));
    expect(newResult.ackCode).toBe('AA');

    const appointments = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appointmentRepo.list(trx, ctxA.tenantId, { patientId: tenantAPatientId }),
    );
    const created = appointments.find((a) => a.scheduledStart.toISOString() === '2028-03-01T09:00:00.000Z');
    expect(created).toBeDefined();
    expect(created?.appointmentType).toBe('office_visit');

    const updateMessage = buildSiuUpdateMessage(`SIU-UPD-${Date.now()}`, created!.id);
    const updateResult = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, updateMessage));
    expect(updateResult.ackCode).toBe('AA');

    const rescheduled = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentRepo.findById(trx, ctxA.tenantId, created!.id));
    expect(rescheduled?.scheduledStart.toISOString()).toBe('2028-03-01T10:00:00.000Z');

    const cancelMessage = buildSiuCancelMessage(`SIU-CAN-${Date.now()}`, created!.id);
    const cancelResult = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, cancelMessage));
    expect(cancelResult.ackCode).toBe('AA');

    const cancelled = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appointmentRepo.findById(trx, ctxA.tenantId, created!.id));
    expect(cancelled?.status).toBe('cancelled');
  });

  it('SIU^S15 for an unknown placer appointment id is a NACK, not a crash', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildSiuCancelMessage(`SIU-UNKNOWN-${Date.now()}`, '00000000-0000-4000-8000-000000000000');

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AE');
    expect(result.detail).toMatch(/No appointment found/);
  });

  it('ORM^O01 creates a new lab order against the correlated encounter', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildOrmMessage(`ORM-${Date.now()}`, tenantAEncounterId, tenantAPractitionerId);

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AA');

    const orders = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx.selectFrom('orders').selectAll().where('tenant_id', '=', ctxA.tenantId).where('encounter_id', '=', tenantAEncounterId).execute(),
    );
    const created = orders.find((o) => o.display_name === 'Basic Metabolic Panel');
    expect(created).toBeDefined();
    expect(created?.code).toBe('BMP');
  });

  it('ORM^O01 for an unknown visit number is a NACK, not a crash', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const message = buildOrmMessage(`ORM-UNKNOWN-${Date.now()}`, '00000000-0000-4000-8000-000000000000', tenantAPractitionerId);

    const result = await withTenantContext(handle.db, ctxA.tenantId, (trx) => ingestionService.ingest(trx, ctxA, message));
    expect(result.ackCode).toBe('AE');
    expect(result.detail).toMatch(/No encounter found/);
  });
});
