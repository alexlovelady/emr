import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { BulkExportRelay } from '../src/bulk-export-relay.js';
import { BulkExportJobRepository } from '../src/bulk-export-job.repository.js';

/** EHR_BUILD_SPEC.md §18.2-style DB-backed test, run via `pnpm test:tenant-isolation` — requires a
 * live Postgres. Uses an in-memory ObjectStorageGateway stub (same approach as the NL-to-cohort-DSL
 * suite's stub) rather than real MinIO/S3. */
describe('BulkExportRelay.tick', () => {
  let handle: TestDbHandle;
  const jobRepo = new BulkExportJobRepository();
  const putObjectCalls: { filename: string; body: string }[] = [];
  const objectStorage: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'k' }),
    getDownloadUrl: async ({ storageKey }) => `https://example.test/download/${storageKey}`,
    headObject: async () => null,
    putObject: async (params) => {
      putObjectCalls.push({ filename: params.filename, body: String(params.body) });
      return { storageKey: `stub/${params.filename}` };
    },
  };
  let relay: BulkExportRelay;
  let tenantAPatientId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    // The relay is constructed with the owner/bootstrap connection in production (see its own
    // doc comment) — `handle.ownerDb` is the exact analog in this test harness.
    relay = new BulkExportRelay(handle.ownerDb, objectStorage, { pollIntervalMs: 999_999, fhirBaseUrl: 'http://localhost:3200/fhir/r4' });

    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: ctxA.tenantId, given_name: 'Bulk', family_name: `Export-${Date.now()}`, date_of_birth: '1975-06-01', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
  });

  afterAll(() => handle.close());

  it('exports only the requested resource type(s) and writes real NDJSON content', async () => {
    const job = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      jobRepo.create(trx, {
        tenantId: handle.seed.tenantA.tenantId,
        requestedByClientId: handle.seed.tenantA.smartClientId,
        resourceTypes: ['Patient'],
        since: null,
      }),
    );

    const processed = await relay.tick();
    expect(processed).toBe(1);

    const completed = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      jobRepo.findById(trx, handle.seed.tenantA.tenantId, job.id),
    );
    expect(completed?.status).toBe('completed');
    expect(completed?.outputFiles).toHaveLength(1);
    expect(completed?.outputFiles?.[0]!.type).toBe('Patient');
    expect(completed?.outputFiles?.[0]!.count).toBeGreaterThanOrEqual(1);

    const written = putObjectCalls.find((c) => c.filename.includes(job.id) && c.filename.includes('Patient'));
    expect(written).toBeDefined();
    const lines = written!.body.trim().split('\n');
    expect(lines.length).toBe(completed!.outputFiles![0]!.count);
    const firstResource = JSON.parse(lines[0]!);
    expect(firstResource.resourceType).toBe('Patient');
    // Confirm the tenant's own seeded patient is really in the output, not a fabricated stand-in.
    expect(lines.some((line) => JSON.parse(line).id === tenantAPatientId)).toBe(true);
  });

  it('a job for a resource type with zero matching rows completes with an empty output list, not an error', async () => {
    // `since` in the far future guarantees zero matches deterministically, regardless of
    // whatever other suites have already accumulated for this shared, never-reset dev DB's
    // seeded Tenant A (no row can have `updated_at` after "tomorrow") — the dev-DB-accumulation
    // gotcha documented elsewhere in this project applies here too.
    const farFuture = new Date(Date.now() + 24 * 3600_000);
    const job = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      jobRepo.create(trx, {
        tenantId: handle.seed.tenantA.tenantId,
        requestedByClientId: handle.seed.tenantA.smartClientId,
        resourceTypes: ['DocumentReference'],
        since: farFuture,
      }),
    );

    await relay.tick();

    const completed = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      jobRepo.findById(trx, handle.seed.tenantA.tenantId, job.id),
    );
    expect(completed?.status).toBe('completed');
    expect(completed?.outputFiles).toEqual([]);
  });

  it('leaves other tenants untouched — only claims one job per tick, oldest first', async () => {
    const jobA = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      jobRepo.create(trx, { tenantId: handle.seed.tenantA.tenantId, requestedByClientId: handle.seed.tenantA.smartClientId, resourceTypes: ['Patient'], since: null }),
    );
    const jobB = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      jobRepo.create(trx, { tenantId: handle.seed.tenantB.tenantId, requestedByClientId: handle.seed.tenantB.smartClientId, resourceTypes: ['Patient'], since: null }),
    );

    await relay.tick();
    const afterFirstTick = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) => jobRepo.findById(trx, handle.seed.tenantB.tenantId, jobB.id));
    expect(afterFirstTick?.status).toBe('pending');

    await relay.tick();
    const jobAAfter = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => jobRepo.findById(trx, handle.seed.tenantA.tenantId, jobA.id));
    const jobBAfter = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) => jobRepo.findById(trx, handle.seed.tenantB.tenantId, jobB.id));
    expect(jobAAfter?.status).toBe('completed');
    expect(jobBAfter?.status).toBe('completed');
  });
});
