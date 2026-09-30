import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction, runWithRequestTransaction } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { SmartClientAdminController } from './smart-client-admin.controller.js';

/**
 * Epic-parity item 4 — this controller has no separate service/repository layer (matches
 * `SmartEhrLaunchController`'s existing raw-Kysely style for this same table), so its behavior is
 * exercised directly here rather than at a lower layer, the same way `apps/api/src/e2e/
 * golden-path.integration.test.ts` exercises cross-domain behavior with no service of its own.
 */
describe('SmartClientAdminController (Epic-parity item 4)', () => {
  let handle: TestDbHandle;
  const controller = new SmartClientAdminController();

  function reqFor(tenantId: string, userId: string) {
    return { ehrContext: requestContextFor(tenantId, userId) } as FastifyRequest;
  }

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  it('creates a client with a real one-time secret that verifies against the stored hash, never returning the hash itself', async () => {
    const { tenantId, adminUserId } = handle.seed.tenantA;
    const created = await runWithRequestTransaction(handle.db, tenantId, () =>
      controller.create(
        {
          displayName: 'Acme Smart App',
          description: 'A test SMART app.',
          developerName: 'Acme Health',
          websiteUrl: 'https://acme.example.test',
          logoUrl: 'https://acme.example.test/logo.png',
          allowedScopes: ['patient/*.read'],
          redirectUris: ['https://acme.example.test/callback'],
          clientType: 'confidential',
          launchUri: null,
        },
        reqFor(tenantId, adminUserId),
      ),
    );

    expect(created.clientSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(created.status).toBe('active');
    expect(Object.keys(created)).not.toContain('client_secret_hash');
    expect(Object.keys(created)).not.toContain('clientSecretHash');

    const storedHash = await runWithRequestTransaction(handle.db, tenantId, () =>
      getCurrentTransaction().selectFrom('smart_clients').select('client_secret_hash').where('id', '=', created.id).executeTakeFirstOrThrow(),
    );
    await expect(argon2.verify(storedHash.client_secret_hash, created.clientSecret)).resolves.toBe(true);
  });

  it('lists only the caller tenant’s clients, and Tenant B cannot update, deactivate, or reactivate a Tenant A client by known id', async () => {
    const { tenantId: tenantAId, adminUserId: adminA } = handle.seed.tenantA;
    const { tenantId: tenantBId, adminUserId: adminB } = handle.seed.tenantB;

    const created = await runWithRequestTransaction(handle.db, tenantAId, () =>
      controller.create(
        { displayName: 'Isolation Test App', allowedScopes: ['patient/*.read'], redirectUris: [], clientType: 'public' },
        reqFor(tenantAId, adminA),
      ),
    );

    const tenantBList = await runWithRequestTransaction(handle.db, tenantBId, () => controller.list(reqFor(tenantBId, adminB)));
    expect(tenantBList.some((c) => c.id === created.id)).toBe(false);

    await expect(
      runWithRequestTransaction(handle.db, tenantBId, () =>
        controller.update(created.id, { displayName: 'Hijacked' }, reqFor(tenantBId, adminB)),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      runWithRequestTransaction(handle.db, tenantBId, () => controller.deactivate(created.id, reqFor(tenantBId, adminB))),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('update() patches only the provided fields, and deactivate/activate enforce the expected prior state', async () => {
    const { tenantId, adminUserId } = handle.seed.tenantA;
    const req = reqFor(tenantId, adminUserId);

    const created = await runWithRequestTransaction(handle.db, tenantId, () =>
      controller.create(
        { displayName: 'Lifecycle App', description: 'Original description.', allowedScopes: ['patient/*.read'], redirectUris: [], clientType: 'public' },
        req,
      ),
    );

    const updated = await runWithRequestTransaction(handle.db, tenantId, () =>
      controller.update(created.id, { displayName: 'Lifecycle App v2' }, req),
    );
    expect(updated.displayName).toBe('Lifecycle App v2');
    expect(updated.description).toBe('Original description.');

    const deactivated = await runWithRequestTransaction(handle.db, tenantId, () => controller.deactivate(created.id, req));
    expect(deactivated.status).toBe('inactive');

    await expect(runWithRequestTransaction(handle.db, tenantId, () => controller.deactivate(created.id, req))).rejects.toBeInstanceOf(
      ConflictError,
    );

    const reactivated = await runWithRequestTransaction(handle.db, tenantId, () => controller.activate(created.id, req));
    expect(reactivated.status).toBe('active');
  });
});
