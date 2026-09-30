import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { TaskService } from '@ehr/tasks';
import { GenomicReportService } from '../src/genomic-report/genomic-report.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — genomics (Epic-parity item 5)', () => {
  let handle: TestDbHandle;
  const reportService = new GenomicReportService();
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
          family_name: `Genomics-${Date.now()}`,
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
          display_name: 'Dr. Genomics Test',
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
        displayName: 'Pharmacogenomic panel',
        findings: [
          { geneSymbol: 'CYP2D6', phenotypeCategory: 'poor_metabolizer', interpretation: 'Reduced enzyme activity.' },
          { geneSymbol: 'BRCA1', hgvsNotation: 'NM_007294.4:c.5266dupC', clinicalSignificance: 'pathogenic', interpretation: 'Known pathogenic variant.' },
        ],
      }),
    );
    tenantAReportId = report.id;
  });

  afterAll(() => handle.close());

  it('create() persists every finding, attached to the report', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const report = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.getById(trx, ctxA, tenantAReportId));
    expect(report.findings).toHaveLength(2);
    expect(report.findings.map((f) => f.geneSymbol).sort()).toEqual(['BRCA1', 'CYP2D6']);
  });

  it('Tenant B cannot read a Tenant A genomic report by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => reportService.getById(trx, ctxB, tenantAReportId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all, on both tables', async () => {
    const reportRows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('genomic_reports').selectAll().where('id', '=', tenantAReportId).execute(),
    );
    expect(reportRows).toHaveLength(0);

    const findingRows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('genomic_findings').selectAll().where('genomic_report_id', '=', tenantAReportId).execute(),
    );
    expect(findingRows).toHaveLength(0);
  });

  it('a pathogenic finding automatically opens a durable Task, but a benign-only report does not', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const tasks = await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.list(trx, ctxA, { patientId: tenantAPatientId }));
    const actionableTask = tasks.find((t) => t.relatedResourceId === tenantAReportId);
    expect(actionableTask).toBeDefined();
    expect(actionableTask?.taskType).toBe('genomic_finding_review');
    expect(actionableTask?.priority).toBe('urgent');

    const benignReport = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      reportService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        displayName: 'Benign-only panel',
        findings: [{ geneSymbol: 'MTHFR', clinicalSignificance: 'benign' }],
      }),
    );
    const tasksAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.list(trx, ctxA, { patientId: tenantAPatientId }));
    expect(tasksAfter.some((t) => t.relatedResourceId === benignReport.id)).toBe(false);
  });

  it('appears in the pending review inbox until reviewed, and is portal-invisible until then', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const inboxBefore = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.inbox(trx, ctxA));
    expect(inboxBefore.some((r) => r.id === tenantAReportId)).toBe(true);

    const releasedBefore = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.listReleased(trx, ctxA, tenantAPatientId));
    expect(releasedBefore.some((r) => r.id === tenantAReportId)).toBe(false);

    await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.review(trx, ctxA, tenantAReportId, 'reviewed'));

    const inboxAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.inbox(trx, ctxA));
    expect(inboxAfter.some((r) => r.id === tenantAReportId)).toBe(false);

    const releasedAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.listReleased(trx, ctxA, tenantAPatientId));
    expect(releasedAfter.some((r) => r.id === tenantAReportId)).toBe(true);
  });

  it('amending a report preserves the original, additively', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const amendment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      reportService.amend(trx, ctxA, tenantAReportId, {
        encounterId: tenantAEncounterId,
        displayName: 'Pharmacogenomic panel (corrected)',
        findings: [{ geneSymbol: 'CYP2D6', phenotypeCategory: 'intermediate_metabolizer' }],
      }),
    );
    expect(amendment.amendsReportId).toBe(tenantAReportId);
    expect(amendment.findings).toHaveLength(1);

    const original = await withTenantContext(handle.db, ctxA.tenantId, (trx) => reportService.getById(trx, ctxA, tenantAReportId));
    expect(original.displayName).toBe('Pharmacogenomic panel');
    expect(original.findings).toHaveLength(2);
  });
});
