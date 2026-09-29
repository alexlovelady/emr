import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { UserService } from '../src/user/user.service.js';
import { PractitionerRoleService } from '../src/practitioner-role/practitioner-role.service.js';

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

describe('practitioner location-role assignments', () => {
  let handle: TestDbHandle;
  const service = new PractitionerRoleService();
  let tenantAPractitionerId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    tenantAPractitionerId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
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
          display_name: `Dr. Assignment Test ${Date.now()}`,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return practitioner.id;
    });
  });

  afterAll(() => handle.close());

  it('creates and lists a location-role assignment, then revokes it', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const assignment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.create(trx, ctxA, tenantAPractitionerId, {
        locationId: handle.seed.tenantA.locationId,
        roleId: handle.seed.roles.staffRoleId,
      }),
    );
    expect(assignment.status).toBe('active');

    const listed = await withTenantContext(handle.db, ctxA.tenantId, (trx) => service.listByPractitioner(trx, ctxA, tenantAPractitionerId));
    expect(listed.some((a) => a.id === assignment.id)).toBe(true);

    const revoked = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.revoke(trx, ctxA, tenantAPractitionerId, assignment.id),
    );
    expect(revoked.status).toBe('revoked');
    expect(revoked.effectiveEnd).not.toBeNull();
  });

  it('rejects revoking an already-revoked assignment', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const assignment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.create(trx, ctxA, tenantAPractitionerId, {
        locationId: handle.seed.tenantA.locationId,
        roleId: handle.seed.roles.staffRoleId,
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => service.revoke(trx, ctxA, tenantAPractitionerId, assignment.id));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => service.revoke(trx, ctxA, tenantAPractitionerId, assignment.id)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('Tenant B cannot revoke a Tenant A assignment by known UUID', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const assignment = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.create(trx, ctxA, tenantAPractitionerId, {
        locationId: handle.seed.tenantA.locationId,
        roleId: handle.seed.roles.staffRoleId,
      }),
    );
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => service.revoke(trx, ctxB, tenantAPractitionerId, assignment.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
