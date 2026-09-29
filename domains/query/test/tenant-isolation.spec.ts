import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { PostgresSearchIndexGateway } from '@ehr/search-adapter';
import { CohortService } from '../src/cohort/cohort.service.js';
import { CohortDslSchema } from '../src/cohort/cohort.dto.js';
import { GOVERNED_QUERIES } from '../src/governed-query/governed-query.registry.js';
import {
  reindexPatients,
  reindexDocuments,
  reindexClaims,
  reindexNotes,
  reindexDiagnosticReports,
  reindexTasks,
  reindexReferrals,
  reindexPractitioners,
  reindexLocations,
} from '../src/search/reindex.js';

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
  // Unique per run (not a fixed literal like the old `QueryMatch-${Date.now()}`) — this dev DB's
  // tenant A is shared and never reset between test runs, so `search_documents` accumulates one row
  // per historical run; a repeated search term eventually exceeds the gateway's default 25-row limit
  // and the current run's row falls out of the top-ranked results. See postgres-search-index-gateway
  // .integration.test.ts's own Zztop/Qwerty/Plugh markers for the same established fix.
  const patientSearchMarker = `Queryzzz${randomUUID().replace(/-/g, '')}`;

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
          family_name: patientSearchMarker,
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

  describe('payer performance & remittance trend queries (Athelas-parity pass)', () => {
    // Unique per run — this dev DB is shared and never reset between runs, so a fixed payer name
    // would accumulate claims from every historical run of this test and break the exact-count
    // assertions below. See the same fix already applied to the search test above.
    const payerName = `AthelasPayer-${Date.now()}`;

    beforeAll(async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        async function newEncounter() {
          const patient = await trx
            .insertInto('patients')
            .values({ tenant_id: ctxA.tenantId, given_name: 'Isolation', family_name: `PayerPerf-${randomUUID()}`, date_of_birth: '1980-01-01', status: 'active' })
            .returning('id')
            .executeTakeFirstOrThrow();
          const appointment = await trx
            .insertInto('appointments')
            .values({
              tenant_id: ctxA.tenantId,
              patient_id: patient.id,
              location_id: handle.seed.tenantA.locationId,
              practitioner_id: tenantAPractitionerId,
              appointment_type: 'office_visit',
              scheduled_start: daysAgo(11),
              scheduled_end: daysAgo(11),
              status: 'checked_in',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          const encounter = await trx
            .insertInto('encounters')
            .values({
              tenant_id: ctxA.tenantId,
              patient_id: patient.id,
              appointment_id: appointment.id,
              location_id: handle.seed.tenantA.locationId,
              practitioner_id: tenantAPractitionerId,
              encounter_type: 'office_visit',
              started_at: daysAgo(11),
              ended_at: daysAgo(11),
              status: 'signed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          const coverage = await trx
            .insertInto('coverages')
            .values({
              tenant_id: ctxA.tenantId,
              patient_id: patient.id,
              payer_name: payerName,
              member_id: 'M-PAYERPERF',
              coverage_type: 'primary',
              effective_start: '2024-01-01',
              status: 'active',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          return { patientId: patient.id, encounterId: encounter.id, coverageId: coverage.id };
        }

        // Paid claim: submitted 10 days ago, remittance posted "now" — a ~10-day days-to-payment.
        const paid = await newEncounter();
        const paidClaim = await trx
          .insertInto('claims')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: paid.patientId,
            encounter_id: paid.encounterId,
            coverage_id: paid.coverageId,
            billing_practitioner_id: tenantAPractitionerId,
            total_charge_amount: '500',
            current_version: 2,
            status: 'paid',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const paidClaimVersion = await trx
          .insertInto('claim_versions')
          .values({
            tenant_id: ctxA.tenantId,
            claim_id: paidClaim.id,
            version_number: 2,
            version_status: 'submitted',
            status: 'submitted',
            payload: JSON.stringify({}),
            submitted_at: daysAgo(10),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('remittances')
          .values({
            tenant_id: ctxA.tenantId,
            claim_id: paidClaim.id,
            claim_version_id: paidClaimVersion.id,
            payer_paid_amount: '500',
            adjustment_amount: '20',
            patient_responsibility_amount: '30',
            raw_payload: JSON.stringify({ source: 'synthetic-835' }),
            status: 'posted',
          })
          .execute();

        // Denied claim: submitted, no remittance, one open denial.
        const denied = await newEncounter();
        const deniedClaim = await trx
          .insertInto('claims')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: denied.patientId,
            encounter_id: denied.encounterId,
            coverage_id: denied.coverageId,
            billing_practitioner_id: tenantAPractitionerId,
            total_charge_amount: '300',
            current_version: 2,
            status: 'denied',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('claim_versions')
          .values({
            tenant_id: ctxA.tenantId,
            claim_id: deniedClaim.id,
            version_number: 2,
            version_status: 'submitted',
            status: 'submitted',
            payload: JSON.stringify({}),
            submitted_at: daysAgo(5),
          })
          .execute();
        await trx
          .insertInto('denials')
          .values({
            tenant_id: ctxA.tenantId,
            claim_id: deniedClaim.id,
            denial_reason_code: 'CO-50',
            denial_reason_text: 'Not medically necessary',
            status: 'open',
          })
          .execute();
      });
    });

    it('summarizes claim volume, denial count, total paid, and avg days-to-payment for a payer', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const results = (await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        GOVERNED_QUERIES.payer_performance_summary!.run(trx, ctxA.tenantId, {}),
      )) as Array<{
        payerName: string;
        claimsTotal: number;
        claimsSubmitted: number;
        claimsPaid: number;
        claimsDenied: number;
        totalPaidAmount: number;
        avgDaysToPayment: number | null;
      }>;

      const row = results.find((r) => r.payerName === payerName)!;
      expect(row).toBeDefined();
      expect(row.claimsTotal).toBe(2);
      expect(row.claimsSubmitted).toBe(2);
      expect(row.claimsPaid).toBe(1);
      expect(row.claimsDenied).toBe(1);
      expect(row.totalPaidAmount).toBe(500);
      expect(row.avgDaysToPayment).toBeGreaterThan(9);
      expect(row.avgDaysToPayment).toBeLessThan(11);
    });

    it('buckets remittance totals by month, filterable to one payer', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const results = (await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        GOVERNED_QUERIES.remittance_trends_by_month!.run(trx, ctxA.tenantId, { payerName }),
      )) as Array<{ month: string; claimsCount: number; totalPaidAmount: number; totalAdjustmentAmount: number; totalPatientResponsibilityAmount: number }>;

      expect(results).toHaveLength(1);
      const currentMonth = new Date().toISOString().slice(0, 7);
      expect(results[0]!.month).toBe(currentMonth);
      expect(results[0]!.claimsCount).toBe(1);
      expect(results[0]!.totalPaidAmount).toBe(500);
      expect(results[0]!.totalAdjustmentAmount).toBe(20);
      expect(results[0]!.totalPatientResponsibilityAmount).toBe(30);
    });

    it('an unfiltered call to remittance_trends_by_month does not throw and includes at least this payer', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const results = (await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        GOVERNED_QUERIES.remittance_trends_by_month!.run(trx, ctxA.tenantId, {}),
      )) as Array<{ totalPaidAmount: number }>;
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Tenant B sees none of Tenant A payer data via either governed query', async () => {
      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
      const performance = (await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        GOVERNED_QUERIES.payer_performance_summary!.run(trx, ctxB.tenantId, {}),
      )) as Array<{ payerName: string }>;
      expect(performance.some((r) => r.payerName === payerName)).toBe(false);

      const trends = (await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        GOVERNED_QUERIES.remittance_trends_by_month!.run(trx, ctxB.tenantId, { payerName }),
      )) as unknown[];
      expect(trends).toHaveLength(0);
    });
  });

  it('reindexes patients/documents/claims and finds them via tenant-scoped full-text search', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      await reindexPatients(trx, ctxA.tenantId, searchGateway);
      await reindexDocuments(trx, ctxA.tenantId, searchGateway);
      await reindexClaims(trx, ctxA.tenantId, searchGateway);
    });

    const patientResults = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxA.tenantId, query: patientSearchMarker, allowedContextTags: [] }),
    );
    expect(patientResults.some((r) => r.resourceId === matchingPatientId)).toBe(true);

    const documentResults = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxA.tenantId, query: 'zzyzxmarker', allowedContextTags: [] }),
    );
    expect(documentResults.length).toBeGreaterThanOrEqual(1);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const crossTenantResults = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxB.tenantId, query: patientSearchMarker, allowedContextTags: [] }),
    );
    expect(crossTenantResults).toHaveLength(0);
  });

  it('reindexes notes/diagnostic-reports/tasks/referrals/practitioners/locations too (spec §9 full coverage)', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const marker = `Fulltextzzz${randomUUID().replace(/-/g, '')}`;

    const { noteId, reportId, taskId, referralId, practitionerId, locationId } = await withTenantContext(
      handle.db,
      ctxA.tenantId,
      async (trx) => {
        const appointment = await trx
          .insertInto('appointments')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: matchingPatientId,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
            appointment_type: 'office_visit',
            scheduled_start: daysAgo(1),
            scheduled_end: daysAgo(1),
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
            started_at: daysAgo(1),
            status: 'signed',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const note = await trx
          .insertInto('notes')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: matchingPatientId,
            encounter_id: encounter.id,
            note_type: 'progress_note',
            content: JSON.stringify({ assessment: marker }),
            status: 'draft',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const report = await trx
          .insertInto('diagnostic_reports')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: matchingPatientId,
            encounter_id: encounter.id,
            display_name: marker,
            status: 'final',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const task = await trx
          .insertInto('tasks')
          .values({ tenant_id: ctxA.tenantId, patient_id: matchingPatientId, task_type: 'follow_up', title: marker, priority: 'normal', status: 'open' })
          .returning('id')
          .executeTakeFirstOrThrow();

        const referral = await trx
          .insertInto('referrals')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: matchingPatientId,
            referring_practitioner_id: tenantAPractitionerId,
            specialty: marker,
            reason: 'full-text coverage test',
            status: 'pending',
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const workforceIdentity = await trx
          .insertInto('workforce_identities')
          .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
          .returning('id')
          .executeTakeFirstOrThrow();
        const practitioner = await trx
          .insertInto('practitioners')
          .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: marker, status: 'active' })
          .returning('id')
          .executeTakeFirstOrThrow();

        const location = await trx
          .insertInto('locations')
          .values({ tenant_id: ctxA.tenantId, organization_id: handle.seed.tenantA.organizationId, name: marker, time_zone: 'America/New_York', status: 'active' })
          .returning('id')
          .executeTakeFirstOrThrow();

        return {
          noteId: note.id,
          reportId: report.id,
          taskId: task.id,
          referralId: referral.id,
          practitionerId: practitioner.id,
          locationId: location.id,
        };
      },
    );

    await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      await reindexNotes(trx, ctxA.tenantId, searchGateway);
      await reindexDiagnosticReports(trx, ctxA.tenantId, searchGateway);
      await reindexTasks(trx, ctxA.tenantId, searchGateway);
      await reindexReferrals(trx, ctxA.tenantId, searchGateway);
      await reindexPractitioners(trx, ctxA.tenantId, searchGateway);
      await reindexLocations(trx, ctxA.tenantId, searchGateway);
    });

    const results = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxA.tenantId, query: marker, allowedContextTags: [] }),
    );
    const resourceIds = results.map((r) => r.resourceId);
    expect(resourceIds).toContain(noteId);
    expect(resourceIds).toContain(reportId);
    expect(resourceIds).toContain(taskId);
    expect(resourceIds).toContain(referralId);
    expect(resourceIds).toContain(practitionerId);
    expect(resourceIds).toContain(locationId);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const crossTenantResults = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      searchGateway.search(trx, { tenantId: ctxB.tenantId, query: marker, allowedContextTags: [] }),
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
