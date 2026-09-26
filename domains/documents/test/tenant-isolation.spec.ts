import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { DocumentService } from '../src/document.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — documents', () => {
  let handle: TestDbHandle;
  // storageKey must be unique per run (documents.storage_key has a unique constraint) — a fixed
  // literal here would collide with a leftover row from a previous run against a persistent DB.
  const fakeGateway: ObjectStorageGateway = {
    getUploadUrl: vi
      .fn()
      .mockResolvedValue({ url: 'https://example.test/upload', storageKey: `tenants/x/documents/${Date.now()}` }),
    getDownloadUrl: vi.fn().mockResolvedValue('https://example.test/download'),
    headObject: vi.fn().mockResolvedValue({ sizeBytes: 10, contentType: 'text/plain' }),
    putObject: vi.fn().mockResolvedValue({ storageKey: `tenants/x/exports/${Date.now()}` }),
  };
  const documentService = new DocumentService(fakeGateway);
  let tenantADocumentId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const { document } = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      documentService.requestUpload(trx, ctxA, { filename: 'chart.pdf', contentType: 'application/pdf' }),
    );
    tenantADocumentId = document.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot obtain a download URL for a Tenant A document', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => documentService.getDownloadUrl(trx, ctxB, tenantADocumentId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot confirm an upload for a Tenant A document', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => documentService.confirmUpload(trx, ctxB, tenantADocumentId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
