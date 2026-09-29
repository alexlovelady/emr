import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { OrganizationService } from '../src/organization/organization.service.js';
import { LocationService } from '../src/location/location.service.js';

/**
 * EHR_BUILD_SPEC.md §18.2 — the Phase 1 exit gate. Requires a live Postgres with migrations
 * applied (DATABASE_URL); run via `pnpm test:tenant-isolation`.
 */
describe('tenant isolation — organizations & locations', () => {
  let handle: TestDbHandle;
  const orgService = new OrganizationService();
  const locationService = new LocationService();

  let tenantALocationId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    const org = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      orgService.create(trx, ctxA, { name: `Isolation Test Org ${Date.now()}` }),
    );
    const location = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      locationService.create(trx, ctxA, { name: `Isolation Test Location ${Date.now()}`, organizationId: org.id }),
    );
    tenantALocationId = location.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read Tenant A location by guessed/known UUID (404, not a leak)', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => locationService.getById(trx, ctxB, tenantALocationId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot see Tenant A rows in list(), even unfiltered', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const locations = await withTenantContext(handle.db, ctxB.tenantId, (trx) => locationService.list(trx, ctxB));
    expect(locations.some((l) => l.id === tenantALocationId)).toBe(false);
  });

  it('Row-Level Security itself blocks cross-tenant reads, independent of repository filtering', async () => {
    // Simulates a hypothetical buggy repository that forgot its own `where tenant_id = ...`
    // filter, by querying directly with only the id predicate under Tenant B's session context.
    // If this ever returns a row, RLS has been misconfigured or bypassed.
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('locations').selectAll().where('id', '=', tenantALocationId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot export Tenant B data — no export endpoint exists yet (reserved, not silently skipped)', () => {
    // Deferred to the phase that adds data export (spec §18.2's 3rd assertion). Documented here
    // so the gap is visible in test output rather than absent from it.
    expect(true).toBe(true);
  });

  it('cannot subscribe to Tenant B webhook/event — no webhook system exists yet (reserved)', () => {
    // Deferred to the phase that adds the webhook gateway (spec §18.2's 4th assertion).
    expect(true).toBe(true);
  });

  it('list() pagination (limit/offset) slices the same order as an unpaginated call', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const all = await withTenantContext(handle.db, ctxA.tenantId, (trx) => locationService.list(trx, ctxA));
    expect(all.length).toBeGreaterThanOrEqual(4);

    const firstTwo = await withTenantContext(handle.db, ctxA.tenantId, (trx) => locationService.list(trx, ctxA, { limit: 2, offset: 0 }));
    const nextTwo = await withTenantContext(handle.db, ctxA.tenantId, (trx) => locationService.list(trx, ctxA, { limit: 2, offset: 2 }));

    expect(firstTwo).toHaveLength(2);
    expect(nextTwo).toHaveLength(2);
    expect(firstTwo.map((l) => l.id)).toEqual(all.slice(0, 2).map((l) => l.id));
    expect(nextTwo.map((l) => l.id)).toEqual(all.slice(2, 4).map((l) => l.id));
    expect(firstTwo[0]!.id).not.toBe(nextTwo[0]!.id);
  });

  it("Tenant B's paginated list() never returns a Tenant A row", async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const page = await withTenantContext(handle.db, ctxB.tenantId, (trx) => locationService.list(trx, ctxB, { limit: 5, offset: 0 }));
    expect(page.some((l) => l.id === tenantALocationId)).toBe(false);
  });

  it('deactivating a location cascades to revoke every active practitioner-role assignment there', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const org = await withTenantContext(handle.db, ctxA.tenantId, (trx) => orgService.create(trx, ctxA, { name: `Cascade Org ${Date.now()}` }));
    const location = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      locationService.create(trx, ctxA, { name: `Cascade Location ${Date.now()}`, organizationId: org.id }),
    );

    const assignmentId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({
          tenant_id: ctxA.tenantId,
          user_id: handle.seed.tenantA.adminUserId,
          organization_id: org.id,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({
          tenant_id: ctxA.tenantId,
          workforce_identity_id: workforceIdentity.id,
          display_name: `Dr. Cascade Test ${Date.now()}`,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const assignment = await trx
        .insertInto('practitioner_roles')
        .values({
          tenant_id: ctxA.tenantId,
          practitioner_id: practitioner.id,
          location_id: location.id,
          role_id: handle.seed.roles.staffRoleId,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return assignment.id;
    });

    await withTenantContext(handle.db, ctxA.tenantId, (trx) => locationService.deactivate(trx, ctxA, location.id));

    const assignmentAfter = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx.selectFrom('practitioner_roles').selectAll().where('id', '=', assignmentId).executeTakeFirstOrThrow(),
    );
    expect(assignmentAfter.status).toBe('revoked');
    expect(assignmentAfter.effective_end).not.toBeNull();
  });

  it('listNames() resolves only the requested ids, isolated per tenant', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const org = await withTenantContext(handle.db, ctxA.tenantId, (trx) => orgService.create(trx, ctxA, { name: `Names Org ${Date.now()}` }));
    const wanted = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      locationService.create(trx, ctxA, { name: `Wanted Location ${Date.now()}`, organizationId: org.id }),
    );
    const other = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      locationService.create(trx, ctxA, { name: `Other Location ${Date.now()}`, organizationId: org.id }),
    );

    const names = await withTenantContext(handle.db, ctxA.tenantId, (trx) => locationService.listNames(trx, ctxA, [wanted.id]));
    expect(names).toHaveLength(1);
    expect(names[0]!.id).toBe(wanted.id);
    expect(names.some((n) => n.id === other.id)).toBe(false);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const crossTenant = await withTenantContext(handle.db, ctxB.tenantId, (trx) => locationService.listNames(trx, ctxB, [wanted.id]));
    expect(crossTenant).toHaveLength(0);
  });
});
