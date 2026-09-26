import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { seedSyntheticFixtures, type DB, type SeedResult } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';

export interface TestDbHandle {
  db: Kysely<DB>;
  seed: SeedResult;
  close: () => Promise<void>;
}

/**
 * Requires a live Postgres (DATABASE_URL) with migrations already applied. Used by every
 * domain's `*.integration.test.ts` / `*.tenant-isolation.test.ts` suite so they all share the
 * exact same two synthetic tenants (spec §18.2's "Tenant A"/"Tenant B").
 */
export async function setupTestDb(): Promise<TestDbHandle> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run integration/tenant-isolation tests.');
  }
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }) });
  const seed = await seedSyntheticFixtures(db);
  return { db, seed, close: () => db.destroy() };
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
