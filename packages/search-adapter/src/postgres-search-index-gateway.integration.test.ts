import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { PostgresSearchIndexGateway } from './postgres-search-index-gateway.js';

/**
 * Confirms spec §9's explicit rule ("filter authorization inside the search query, never
 * post-fetch") is real: tenant isolation and sensitivity-tag filtering are both proven by querying
 * for a document that a differently-scoped request should never even retrieve, not by fetching it
 * and checking it was hidden.
 */
describe('PostgresSearchIndexGateway', () => {
  let handle: TestDbHandle;
  const gateway = new PostgresSearchIndexGateway();

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  it('indexes a document and finds it by full-text query', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const resourceId = crypto.randomUUID();

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Patient',
        resourceId,
        sensitivityTags: [],
        allowedContextTags: [],
        title: 'Jane Doe',
        body: 'MRN-778899 jane.doe@example.test',
      }),
    );

    const results = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxA.tenantId, query: 'Jane Doe', allowedContextTags: [] }),
    );
    expect(results.some((r) => r.resourceId === resourceId)).toBe(true);
  });

  it('never returns another tenant’s document, even for an identical query', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const resourceId = crypto.randomUUID();

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Patient',
        resourceId,
        sensitivityTags: [],
        allowedContextTags: [],
        title: 'Tenant-A-Only-Patient-Zztop',
        body: 'unique searchable marker',
      }),
    );

    const resultsAsB = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxB.tenantId, query: 'Zztop', allowedContextTags: [] }),
    );
    expect(resultsAsB).toHaveLength(0);
  });

  it('filters a sensitivity-tagged document out unless the caller has the matching context tag', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const resourceId = crypto.randomUUID();

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Document',
        resourceId,
        sensitivityTags: ['restricted'],
        allowedContextTags: [],
        title: 'Confidential-Zyxwvu',
        body: 'sensitive marker term',
      }),
    );

    const withoutAccess = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxA.tenantId, query: 'Zyxwvu', allowedContextTags: [] }),
    );
    expect(withoutAccess).toHaveLength(0);

    const withAccess = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxA.tenantId, query: 'Zyxwvu', allowedContextTags: ['restricted'] }),
    );
    expect(withAccess.some((r) => r.resourceId === resourceId)).toBe(true);
  });

  it('re-indexing the same resource upserts rather than duplicating', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const resourceId = crypto.randomUUID();

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Claim',
        resourceId,
        sensitivityTags: [],
        allowedContextTags: [],
        title: 'Claim-Original-Qwerty',
        body: 'original',
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Claim',
        resourceId,
        sensitivityTags: [],
        allowedContextTags: [],
        title: 'Claim-Updated-Qwerty',
        body: 'updated',
      }),
    );

    const results = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxA.tenantId, query: 'Qwerty', allowedContextTags: [] }),
    );
    const matches = results.filter((r) => r.resourceId === resourceId);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.title).toBe('Claim-Updated-Qwerty');
  });

  it('deleteDocument removes it from search results', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const resourceId = crypto.randomUUID();

    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.indexDocument(trx, {
        tenantId: ctxA.tenantId,
        patientId: null,
        resourceType: 'Patient',
        resourceId,
        sensitivityTags: [],
        allowedContextTags: [],
        title: 'ToBeDeleted-Plugh',
        body: 'marker',
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.deleteDocument(trx, { tenantId: ctxA.tenantId, resourceType: 'Patient', resourceId }),
    );

    const results = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      gateway.search(trx, { tenantId: ctxA.tenantId, query: 'Plugh', allowedContextTags: [] }),
    );
    expect(results).toHaveLength(0);
  });
});
