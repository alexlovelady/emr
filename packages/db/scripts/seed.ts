import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../src/types.js';
import { seedSyntheticFixtures } from '../src/seed-fixtures.js';

/**
 * Connects via DATABASE_URL (the bootstrap/owner role), NOT APP_DATABASE_URL. Seeding writes
 * rows across two different synthetic tenants in one run; the owner connection bypasses
 * Row-Level Security (by design — see migration 0001/ADR-0001), whereas the `ehr_app` role would
 * be rejected by each table's tenant_isolation WITH CHECK policy since no single
 * `app.tenant_id` session value applies across tenants. This mirrors how migrations connect and
 * is the same trust boundary: an operator running a deliberate bootstrap script, not application
 * request traffic.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to run the seed script (see .env.example).`);
  return value;
}

async function main(): Promise<void> {
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: requireEnv('DATABASE_URL') }),
    }),
  });

  try {
    const result = await seedSyntheticFixtures(db);
    // eslint-disable-next-line no-console
    console.log('[seed] synthetic fixtures ready:');
    // eslint-disable-next-line no-console
    console.log(`  Tenant A: ${result.tenantA.slug} (${result.tenantA.tenantId})`);
    // eslint-disable-next-line no-console
    console.log(`    admin: ${result.tenantA.adminEmail}  staff: ${result.tenantA.staffEmail}`);
    // eslint-disable-next-line no-console
    console.log(`  Tenant B: ${result.tenantB.slug} (${result.tenantB.tenantId})`);
    // eslint-disable-next-line no-console
    console.log(`    admin: ${result.tenantB.adminEmail}  staff: ${result.tenantB.staffEmail}`);
    // eslint-disable-next-line no-console
    console.log('  (dev password for all seeded users: see DEV_PASSWORD in src/seed-fixtures.ts)');
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
