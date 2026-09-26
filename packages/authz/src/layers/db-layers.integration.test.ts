import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { seedSyntheticFixtures, type SeedResult, type DB } from '@ehr/db';
import { userStatusLayer } from './user-status.layer.js';
import { rolePermissionLayer } from './role-permission.layer.js';
import type { AuthzContext } from '../context.js';

/**
 * Requires a live Postgres reachable via DATABASE_URL with migrations already applied (see
 * packages/db's migrate:latest). Run via `pnpm test:integration`, never part of the default
 * `test` task — see turbo.json.
 */
describe('user-status / role-permission layers (integration)', () => {
  let db: Kysely<DB>;
  let seed: SeedResult;

  beforeAll(async () => {
    db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    seed = await seedSyntheticFixtures(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  function ctxFor(tenantId: string, userId: string, action: string): AuthzContext {
    return { tenantId, actor: { id: userId, type: 'user' }, action, requestId: 'r1' };
  }

  it('userStatusLayer allows an active seeded admin', async () => {
    const result = await userStatusLayer.evaluate(ctxFor(seed.tenantA.tenantId, seed.tenantA.adminUserId, 'x'), db);
    expect(result).toBe('ALLOW');
  });

  it('userStatusLayer denies an unknown user id', async () => {
    const result = await userStatusLayer.evaluate(
      ctxFor(seed.tenantA.tenantId, '00000000-0000-0000-0000-000000000000', 'x'),
      db,
    );
    expect(result).toBe('DENY');
  });

  it('rolePermissionLayer allows the platform admin for location.manage', async () => {
    const result = await rolePermissionLayer.evaluate(
      ctxFor(seed.tenantA.tenantId, seed.tenantA.adminUserId, 'location.manage'),
      db,
    );
    expect(result).toBe('ALLOW');
  });

  it('rolePermissionLayer denies staff for location.manage (staff only has document permissions)', async () => {
    const result = await rolePermissionLayer.evaluate(
      ctxFor(seed.tenantA.tenantId, seed.tenantA.staffUserId, 'location.manage'),
      db,
    );
    expect(result).toBe('DENY');
  });

  it('rolePermissionLayer does not grant a Tenant A user permissions checked under Tenant B', async () => {
    const result = await rolePermissionLayer.evaluate(
      ctxFor(seed.tenantB.tenantId, seed.tenantA.adminUserId, 'location.manage'),
      db,
    );
    expect(result).toBe('DENY');
  });

  it('userStatusLayer denies a disabled user even though their role grant is otherwise valid', async () => {
    const disabled = await db
      .insertInto('users')
      .values({
        tenant_id: seed.tenantA.tenantId,
        email: `disabled-${Date.now()}@tenant-a.test`,
        password_hash: 'unused',
        password_algo: 'argon2id',
        status: 'disabled',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const result = await userStatusLayer.evaluate(ctxFor(seed.tenantA.tenantId, disabled.id, 'x'), db);
    expect(result).toBe('DENY');
  });
});
