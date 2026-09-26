import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { PostgresSearchIndexGateway } from '@ehr/search-adapter';
import { CohortService } from '../src/cohort/cohort.service.js';
import { CohortDslSchema } from '../src/cohort/cohort.dto.js';
import { GOVERNED_QUERIES } from '../src/governed-query/governed-query.registry.js';
import { reindexPatients, reindexDocuments, reindexClaims } from '../src/search/reindex.js';

function isoDateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — query platform', () => {
  let handle: TestDbHandle;
  const fakeGateway: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'tenants/x/exports/fake' }),
    getDownloadUrl: async () => 'https://example.test/download',
    headObject: async () => ({ sizeBytes: 10, contentType: 'text/csv' }),
    putObject: async (params) => ({ storageKey: `tenants/${params.tenantId}/exports/${Date.now()}-${params.filename}` }),
  };
  const cohortService = new CohortService(fakeGateway);
  const searchGateway = new PostgresSearchIndexGateway();

  let tenantAPractitionerId: string;
  let matchingPatientId: string;
  let nonMatchingPatientId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Query Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      tenantAPractitionerId = practitioner.id;

      // Matching patient: age ~55, active E11 diabetes, HbA1c 10.2 (>9), encounter ended 200 days ago (>180).
      const matchingPatient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `QueryMatch-${Date.now()}`,
          date_of_birth: isoDateYearsAgo(55),
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      matchingPatientId = matchingPatient.id;

      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: tenantAPractitionerId,
          appointment_type: 'office_visit',
          scheduled_start: daysAgo(201),
          scheduled_end: daysAgo(201),
          status: 'checked_in',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const encounter = await trx
        .insertInto('encounters')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          appointment_id: appointment.id,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: tenantAPractitionerId,
          encounter_type: 'office_visit',
          started_at: daysAgo(200),
          ended_at: daysAgo(200),
          status: 'signed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('problems')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          code_system: 'ICD10CM',
          code: 'E11.9',
          display_name: 'Type 2 diabetes mellitus without complications',
          clinical_status: 'active',
          status: 'active',
        })
        .execute();

      await trx
        .insertInto('observations')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          encounter_id: encounter.id,
          category: 'laboratory',
          code: '4548-4',
          display_name: 'Hemoglobin A1c',
          value_quantity: '10.2',
          effective_at: daysAgo(200),
          status: 'final',
        })
        .execute();

      // Non-matching patient: same age bracket, no diabetes at all.
      const nonMatchingPatient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `QueryNoMatch-${Date.now()}`,
          date_of_birth: isoDateYearsAgo(50),
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      nonMatchingPatientId = nonMatchingPatient.id;

      // Search fixtures: a document and a claim. `document_category` carries a single clean
      // alphanumeric marker word (not full-text-search substring matching — a query for a
      // substring of a larger hyphenated/punctuated token would not match its own lexeme).
      await trx
        .insertInto('documents')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          filename: 'labs.pdf',
          content_type: 'application/pdf',
          document_category: 'zzyzxmarker',
          storage_key: `tenants/${ctxA.tenantId}/documents/${Date.now()}-fixture.pdf`,
          uploaded_by: handle.seed.tenantA.adminUserId,
          status: 'stored',
        })
        .execute();

      await trx
        .insertInto('charges')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          encounter_id: encounter.id,
          billing_practitioner_id: tenantAPractitionerId,
          code_system: 'CPT',
          code: '99213',
          description: 'Office visit',
          unit_price: '150',
          status: 'coded',
        })
        .execute();
      const claim = await trx
        .insertInto('claims')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: matchingPatientId,
          encounter_id: encounter.id,
          billing_practitioner_id: tenantAPractitionerId,
          total_charge_amount: '150',
          status: 'draft',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      void claim;
    });
  });

  afterAll(() => handle.close());

  const fullDsl = {
    version: 1 as const,
    entity: 'patient' as const,
    where: {
      all: [
        { field: 'age' as const, op: 'between' as const, value: [45, 75] as [number, number] },
        { concept: 'condition' as const, system: 'ICD10CM', op: 'active' as const, value: 'E11' },
        { measure: 'latest_hba1c' as const, op: '>' as const, value: 9 },
        { measure: 'days_since_completed_encounter' as const, op: '>' as const, value: 180 },
      ],
    },
  };

  it('the spec\'s own worked example compiles and finds exactly the matching patient', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const execution = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.execute(trx, ctxA, null, fullDsl));

    expect(execution.resultPatientIds).toContain(matchingPatientId);
    expect(execution.resultPatientIds).not.toContain(nonMatchingPatientId);
    expect(execution.resultCount).toBe(execution.resultPatientIds.length);
    expect(typeof execution.estimatedRows === 'number' || execution.estimatedRows === null).toBe(true);
  });

  it('rejects a DSL with an unknown field before ever compiling it', () => {
    const result = CohortDslSchema.safeParse({
      version: 1,
      entity: 'patient',
      where: { all: [{ field: 'zip_code', op: 'eq', value: 1 }] },
    });
    expect(result.success).toBe(false);
  });

  it('saves a cohort, executes it, lists its executions, and exports the result', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const cohort = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      cohortService.create(trx, ctxA, { name: 'Uncontrolled diabetics', description: null, dsl: fullDsl }),
    );

    const dsl = CohortDslSchema.parse(cohort.dslPayload);
    const execution = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.execute(trx, ctxA, cohort.id, dsl));
    expect(execution.cohortId).toBe(cohort.id);

    const executions = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.listExecutions(trx, ctxA, cohort.id));
    expect(executions.map((e) => e.id)).toContain(execution.id);

    const { downloadUrl } = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.exportExecution(trx, ctxA, execution.id));
    expect(downloadUrl).toBe('https://example.test/download');

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => cohortService.getById(trx, ctxB, cohort.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a raw cross-tenant query on cohorts', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const cohort = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      cohortService.create(trx, ctxA, { name: 'RLS check', description: null, dsl: fullDsl }),
    );
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('cohorts').selectAll().where('id', '=', cohort.id).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('the governed patient-count-by-problem query returns a real tenant-scoped count', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const result = (await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      GOVERNED_QUERIES.patient_count_by_active_problem!.run(trx, ctxA.tenantId, { codeSystem: 'ICD10CM', code: 'E11' }),
    )) as { count: number };
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid governed-query parameters', () => {
    const parsed = GOVERNED_QUERIES.encounters_by_month!.paramsSchema.safeParse({ startDate: 'not-a-date', endDate: 'nope' });
    expect(parsed.success).toBe(false);
  });

  it('reindexes patients/documents/claims and finds them via tenant-scoped full-text search', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      await reindexPatients(trx, ctxA.tenantId, searchGateway);
      await reindexDocuments(trx, ctxA.tenantId, searchGateway);
      await reindexClaims(trx, ctxA.tenantId, searchGateway);
    });

    const patientResults = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxA.tenantId, query: 'QueryMatch', allowedContextTags: [] }),
    );
    expect(patientResults.some((r) => r.resourceId === matchingPatientId)).toBe(true);

    const documentResults = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxA.tenantId, query: 'zzyzxmarker', allowedContextTags: [] }),
    );
    expect(documentResults.length).toBeGreaterThanOrEqual(1);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const crossTenantResults = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxB.tenantId, query: 'QueryMatch', allowedContextTags: [] }),
    );
    expect(crossTenantResults).toHaveLength(0);
  });

  it('cannot export an execution with zero results', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const noMatchDsl = {
      version: 1 as const,
      entity: 'patient' as const,
      where: { all: [{ field: 'age' as const, op: 'gt' as const, value: 200 }] },
    };
    const execution = await withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.execute(trx, ctxA, null, noMatchDsl));
    expect(execution.resultCount).toBe(0);

    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => cohortService.exportExecution(trx, ctxA, execution.id)),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
