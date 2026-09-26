import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { UserService } from '../src/user/user.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — users', () => {
  let handle: TestDbHandle;
  const userService = new UserService();
  let tenantAUserId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const user = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      userService.create(trx, ctxA, { email: `isolation-${Date.now()}@tenant-a.test`, password: 'a-long-enough-password' }),
    );
    tenantAUserId = user.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A user by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => userService.getById(trx, ctxB, tenantAUserId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot see Tenant A users in list()', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const users = await withTenantContext(handle.db, ctxB.tenantId, (trx) => userService.list(trx, ctxB));
    expect(users.some((u) => u.id === tenantAUserId)).toBe(false);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('users').selectAll().where('id', '=', tenantAUserId).execute(),
    );
    expect(rows).toHaveLength(0);
  });
});
