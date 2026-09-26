import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { TaskService } from '@ehr/tasks';
import { DiagnosticReportService } from '../src/diagnostic-report/diagnostic-report.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — results', () => {
  let handle: TestDbHandle;
  const reportService = new DiagnosticReportService();
  const taskService = new TaskService();

  let tenantAPatientId: string;
  let tenantAEncounterId: string;
  let tenantAReportId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Result-${Date.now()}`,
          date_of_birth: '1970-06-01',
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
          display_name: 'Dr. Result Test',
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

    const report = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      reportService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        displayName: 'Potassium panel',
        criticalFlag: true,
        abnormalFlag: true,
        results: [{ code: '2823-3', display: 'Potassium', valueQuantity: 6.8, unit: 'mmol/L' }],
      }),
    );
    tenantAReportId = report.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A diagnostic report by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => reportService.getById(trx, ctxB, tenantAReportId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('diagnostic_reports').selectAll().where('id', '=', tenantAReportId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('a critical result automatically creates a durable Task', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const tasks = await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.list(trx, ctxA, { patientId: tenantAPatientId }));
    const criticalTask = tasks.find((t) => t.relatedResourceId === tenantAReportId);
    expect(criticalTask).toBeDefined();
    expect(criticalTask?.taskType).toBe('critical_result_review');
    expect(criticalTask?.priority).toBe('urgent');
  });

  it('appears in the pending review inbox until reviewed', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const inboxBefore = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.inbox(trx, ctxA));
    expect(inboxBefore.some((r) => r.id === tenantAReportId)).toBe(true);

    await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.review(trx, ctxA, tenantAReportId, 'acknowledged'));

    const inboxAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.inbox(trx, ctxA));
    expect(inboxAfter.some((r) => r.id === tenantAReportId)).toBe(false);
  });

  it('amending a report preserves the original, additively', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const amendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      reportService.amend(trx, ctxA, tenantAReportId, {
        encounterId: tenantAEncounterId,
        displayName: 'Potassium panel (corrected)',
        criticalFlag: false,
        abnormalFlag: true,
        results: [{ code: '2823-3', display: 'Potassium', valueQuantity: 5.1, unit: 'mmol/L' }],
      }),
    );
    expect(amendment.amendsReportId).toBe(tenantAReportId);

    const original = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.getById(trx, ctxA, tenantAReportId));
    expect(original.displayName).toBe('Potassium panel');
    expect(original.criticalFlag).toBe(true);
  });
});
