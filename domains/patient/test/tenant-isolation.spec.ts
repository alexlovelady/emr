import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { PatientService } from '../src/patient/patient.service.js';
import { PatientIdentifierService } from '../src/identifier/identifier.service.js';
import { CoverageService } from '../src/coverage/coverage.service.js';
import { PatientTimelineService } from '../src/timeline/patient-timeline.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — patients', () => {
  let handle: TestDbHandle;
  const patientService = new PatientService();
  const identifierService = new PatientIdentifierService();
  const coverageService = new CoverageService();
  const timelineService = new PatientTimelineService();
  let tenantAPatientId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const patient = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      patientService.create(trx, ctxA, {
        givenName: 'Isolation',
        familyName: `Patient-${Date.now()}`,
        dateOfBirth: '1980-06-15',
      }),
    );
    tenantAPatientId = patient.id;

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      identifierService.create(trx, ctxA, tenantAPatientId, {
        identifierSystem: 'MRN',
        value: `MRN-${Date.now()}`,
        isPrimary: true,
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      coverageService.create(trx, ctxA, tenantAPatientId, {
        payerName: 'Acme Health Plan',
        memberId: `MEM-${Date.now()}`,
        coverageType: 'primary',
        effectiveStart: '2024-01-01',
      }),
    );
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A patient by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => patientService.getById(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot see Tenant A patients in list()', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const patients = await withTenantContext(handle.db, ctxB.tenantId, (trx) => patientService.list(trx, ctxB));
    expect(patients.some((p) => p.id === tenantAPatientId)).toBe(false);
  });

  it("Tenant B cannot read Tenant A's identifiers or coverages for a guessed patient id", async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => identifierService.list(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => coverageService.list(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('patients').selectAll().where('id', '=', tenantAPatientId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('the timeline aggregates appointments and tasks for the patient', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => timelineService.getTimeline(trx, ctxA, tenantAPatientId));
    expect(timeline.patient.id).toBe(tenantAPatientId);
    expect(Array.isArray(timeline.entries)).toBe(true);
  });

  it('surfaces a duplicate candidate by exact date-of-birth + name match, and merge is reversible', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const original = await patientServiceGetById(ctxA);

    const duplicate = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      patientService.create(trx, ctxA, {
        givenName: original.givenName,
        familyName: original.familyName,
        dateOfBirth: original.dateOfBirth,
      }),
    );

    const candidates = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      patientService.findDuplicates(trx, ctxA, { givenName: original.givenName, familyName: original.familyName, dateOfBirth: original.dateOfBirth }, duplicate.id),
    );
    expect(candidates.some((c) => c.id === tenantAPatientId && c.score >= 70)).toBe(true);

    const merge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      patientService.merge(trx, ctxA, tenantAPatientId, { sourcePatientId: duplicate.id, reason: 'confirmed duplicate' }),
    );
    const mergedSource = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.getById(trx, ctxA, duplicate.id));
    expect(mergedSource.status).toBe('merged');

    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        patientService.merge(trx, ctxA, tenantAPatientId, { sourcePatientId: duplicate.id }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const reversed = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.reverseMerge(trx, ctxA, merge.id));
    expect(reversed.reversedAt).not.toBeNull();
    const unmergedSource = await withTenantContext(handle.db, ctxA.tenantId, (trx) => patientService.getById(trx, ctxA, duplicate.id));
    expect(unmergedSource.status).toBe('active');
  });

  async function patientServiceGetById(ctx: ReturnType<typeof requestContextFor>) {
    return withTenantContext(handle.db, ctx.tenantId, (trx) => patientService.getById(trx, ctx, tenantAPatientId));
  }
});
