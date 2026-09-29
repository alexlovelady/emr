import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { SYSTEM_ROLE_KEYS } from '@ehr/db';
import { UserService } from '../src/user/user.service.js';
import { PractitionerRoleService } from '../src/practitioner-role/practitioner-role.service.js';
import { RoleService } from '../src/role/role.service.js';
import { PractitionerService } from '../src/practitioner/practitioner.service.js';

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

  it('list() pagination (limit/offset) slices the same order as an unpaginated call', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const all = await withTenantContext(handle.db, ctxA.tenantId, (trx) => userService.list(trx, ctxA));
    expect(all.length).toBeGreaterThanOrEqual(2);

    const firstTwo = await withTenantContext(handle.db, ctxA.tenantId, (trx) => userService.list(trx, ctxA, { limit: 2, offset: 0 }));
    expect(firstTwo).toHaveLength(2);
    expect(firstTwo.map((u) => u.id)).toEqual(all.slice(0, 2).map((u) => u.id));
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

describe('bulk role-grant listing', () => {
  let handle: TestDbHandle;
  const userService = new UserService();
  const roleService = new RoleService();

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  it('lists role grants for several users in one call, keyed correctly per user', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const userWithRole = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      userService.create(trx, ctxA, { email: `bulk-grants-a-${Date.now()}@tenant-a.test`, password: 'a-long-enough-password' }),
    );
    const userWithoutRole = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      userService.create(trx, ctxA, { email: `bulk-grants-b-${Date.now()}@tenant-a.test`, password: 'a-long-enough-password' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      roleService.assignToUser(trx, ctxA, userWithRole.id, { roleKey: SYSTEM_ROLE_KEYS.STAFF }),
    );

    const grants = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      roleService.listGrantsForUsers(trx, ctxA, [userWithRole.id, userWithoutRole.id]),
    );
    expect(grants.some((g) => g.userId === userWithRole.id && g.roleKey === SYSTEM_ROLE_KEYS.STAFF)).toBe(true);
    expect(grants.some((g) => g.userId === userWithoutRole.id)).toBe(false);
  });

  it("Tenant B's bulk lookup returns nothing for a Tenant A user id, even though it's a valid UUID", async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const tenantAUser = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      userService.create(trx, ctxA, { email: `bulk-grants-isolation-${Date.now()}@tenant-a.test`, password: 'a-long-enough-password' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      roleService.assignToUser(trx, ctxA, tenantAUser.id, { roleKey: SYSTEM_ROLE_KEYS.STAFF }),
    );

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const grants = await withTenantContext(handle.db, ctxB.tenantId, (trx) => roleService.listGrantsForUsers(trx, ctxB, [tenantAUser.id]));
    expect(grants).toHaveLength(0);
  });
});

describe('practitioner name lookup (low-permission)', () => {
  let handle: TestDbHandle;
  const practitionerService = new PractitionerService();

  beforeAll(async () => {
    handle = await setupTestDb();
  });

  afterAll(() => handle.close());

  async function createPractitioner(ctx: ReturnType<typeof requestContextFor>, displayName: string) {
    return withTenantContext(handle.db, ctx.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctx.tenantId, user_id: ctx.actor?.id ?? handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctx.tenantId, workforce_identity_id: workforceIdentity.id, display_name: displayName, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return practitioner.id;
    });
  }

  it('resolves display names for the given ids only', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const wantedId = await createPractitioner(ctxA, `Dr. Wanted ${Date.now()}`);
    const otherId = await createPractitioner(ctxA, `Dr. Not Requested ${Date.now()}`);

    const names = await withTenantContext(handle.db, ctxA.tenantId, (trx) => practitionerService.listNames(trx, ctxA, [wantedId]));
    expect(names).toHaveLength(1);
    expect(names[0]!.id).toBe(wantedId);
    expect(names.some((n) => n.id === otherId)).toBe(false);
  });

  it("Tenant B's lookup returns nothing for a Tenant A practitioner id", async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const tenantAPractitionerId = await createPractitioner(ctxA, `Dr. Isolation ${Date.now()}`);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const names = await withTenantContext(handle.db, ctxB.tenantId, (trx) => practitionerService.listNames(trx, ctxB, [tenantAPractitionerId]));
    expect(names).toHaveLength(0);
  });
});
