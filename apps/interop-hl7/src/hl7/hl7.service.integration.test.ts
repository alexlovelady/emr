import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopLabOrderGateway } from '@ehr/lab-adapter';
import { OrderService } from '@ehr/orders';
import { DiagnosticReportService } from '@ehr/results';
import { Hl7IngestionService } from './hl7.service.js';

function buildOruMessage(controlId: string, placerOrderNumber: string): string {
  return [
    `MSH|^~\\&|LAB_SYSTEM|EXTERNAL_LAB|EHR|TENANT_A|20260926120000||ORU^R01|${controlId}|P|2.5.1`,
    'PID|1||PT-9001^^^MRN||DOE^JANE||19800101|F',
    `OBR|1|${placerOrderNumber}|FILLER-500|CBC^Complete Blood Count^L||20260926110000`,
    'OBX|1|NM|2823-3^Potassium^LN||6.8|mmol/L|3.5-5.1|HH|||F',
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
