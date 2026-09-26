import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { seedSyntheticFixtures, type DB, type SeedResult } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';

export interface TestDbHandle {
  /**
   * Connected as `ehr_app` (APP_DATABASE_URL) — the same role apps/api actually uses. Every
   * domain service/repository call under test MUST go through this, not `ownerDb`, or the test
   * silently stops exercising Row-Level Security at all (the owner role bypasses RLS
   * unconditionally — see ADR-0001). Always wrap calls in `withTenantContext`/
   * `runWithRequestTransaction`, matching how a real request scopes its transaction.
   */
  db: Kysely<DB>;
  /**
   * Connected as the bootstrap/owner role (DATABASE_URL). Only for setup that must cross
   * tenants (seeding) — never for anything a tenant-isolation test asserts on, since it bypasses
   * the exact mechanism those assertions exist to check.
   */
  ownerDb: Kysely<DB>;
  seed: SeedResult;
  close: () => Promise<void>;
}

/**
 * Requires a live Postgres (DATABASE_URL + APP_DATABASE_URL) with migrations already applied.
 * Used by every domain's `*.integration.test.ts` / `*.tenant-isolation.test.ts` suite so they all
 * share the exact same two synthetic tenants (spec §18.2's "Tenant A"/"Tenant B").
 */
export async function setupTestDb(): Promise<TestDbHandle> {
  const ownerConnectionString = process.env.DATABASE_URL;
  const appConnectionString = process.env.APP_DATABASE_URL;
  if (!ownerConnectionString) {
    throw new Error('DATABASE_URL is required to run integration/tenant-isolation tests.');
  }
  if (!appConnectionString) {
    throw new Error('APP_DATABASE_URL is required to run integration/tenant-isolation tests.');
  }

  const ownerDb = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: ownerConnectionString }) }),
  });
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: appConnectionString }) }),
  });

  const seed = await seedSyntheticFixtures(ownerDb);

  return {
    db,
    ownerDb,
    seed,
    close: async () => {
      await db.destroy();
      await ownerDb.destroy();
    },
  };
}

/** Builds a RequestContext for a seeded user, as if TenantContextMiddleware had verified a JWT. */
export function requestContextFor(
  tenantId: string,
  userId: string,
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    tenantId,
    actor: { id: userId, type: 'user' },
    requestId: randomUUID(),
    correlationId: randomUUID(),
    ...overrides,
  };
}
