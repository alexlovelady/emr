import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import { Pool } from 'pg';
import { seedSyntheticFixtures, withTenantContext, type SeedResult, type DB } from '@ehr/db';
import { userStatusLayer } from './user-status.layer.js';
import { rolePermissionLayer } from './role-permission.layer.js';
import type { AuthzContext } from '../context.js';
import type { PolicyLayer } from '../policy-layer.js';

/**
 * Requires a live Postgres reachable via DATABASE_URL/APP_DATABASE_URL with migrations already
 * applied (see packages/db's migrate:latest). Run via `pnpm test:integration`, never part of the
 * default `test` task — see turbo.json.
 */
describe('user-status / role-permission layers (integration)', () => {
  let ownerDb: Kysely<DB>;
  let appDb: Kysely<DB>;
  let seed: SeedResult;

  beforeAll(async () => {
    // Setup (seeding, the ad-hoc disabled-user insert below) uses the owner role — it writes
    // across tenants / without a single tenant context, which ehr_app's RLS would reject.
    ownerDb = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    seed = await seedSyntheticFixtures(ownerDb);

    // The layers under test MUST run against ehr_app (APP_DATABASE_URL) — the role apps/api
    // actually uses — so this suite also verifies their queries agree with Row-Level Security,
    // not just with their own explicit `where tenant_id = ...` filters.
    appDb = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.APP_DATABASE_URL }) }),
    });
  });

  afterAll(async () => {
    await ownerDb.destroy();
    await appDb.destroy();
  });

  function ctxFor(tenantId: string, userId: string, action: string): AuthzContext {
    return { tenantId, actor: { id: userId, type: 'user' }, action, requestId: 'r1' };
  }

  /** Mirrors production: layers only ever run inside the request's shared tenant transaction. */
  function evalLayer(layer: PolicyLayer, ctx: AuthzContext) {
    return withTenantContext(appDb, ctx.tenantId, (trx: Transaction<DB>) => layer.evaluate(ctx, trx));
  }

  it('userStatusLayer allows an active seeded admin', async () => {
    const result = await evalLayer(userStatusLayer, ctxFor(seed.tenantA.tenantId, seed.tenantA.adminUserId, 'x'));
    expect(result).toBe('ALLOW');
  });

  it('userStatusLayer denies an unknown user id', async () => {
    const result = await evalLayer(
      userStatusLayer,
      ctxFor(seed.tenantA.tenantId, '00000000-0000-0000-0000-000000000000', 'x'),
    );
    expect(result).toBe('DENY');
  });

  it('rolePermissionLayer allows the platform admin for location.manage', async () => {
    const result = await evalLayer(
      rolePermissionLayer,
      ctxFor(seed.tenantA.tenantId, seed.tenantA.adminUserId, 'location.manage'),
    );
    expect(result).toBe('ALLOW');
  });

  it('rolePermissionLayer denies staff for location.manage (staff only has document permissions)', async () => {
    const result = await evalLayer(
      rolePermissionLayer,
      ctxFor(seed.tenantA.tenantId, seed.tenantA.staffUserId, 'location.manage'),
    );
    expect(result).toBe('DENY');
  });

  it('rolePermissionLayer does not grant a Tenant A user permissions checked under Tenant B', async () => {
    const result = await evalLayer(
      rolePermissionLayer,
      ctxFor(seed.tenantB.tenantId, seed.tenantA.adminUserId, 'location.manage'),
    );
    expect(result).toBe('DENY');
  });

  it('userStatusLayer denies a disabled user even though their role grant is otherwise valid', async () => {
    const disabled = await withTenantContext(ownerDb, seed.tenantA.tenantId, (trx) =>
      trx
        .insertInto('users')
        .values({
          tenant_id: seed.tenantA.tenantId,
          email: `disabled-${Date.now()}@tenant-a.test`,
          password_hash: 'unused',
          password_algo: 'argon2id',
          status: 'disabled',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    const result = await evalLayer(userStatusLayer, ctxFor(seed.tenantA.tenantId, disabled.id, 'x'));
    expect(result).toBe('DENY');
  });
});
