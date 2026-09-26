import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool } from 'pg';
import type { DB } from './types.js';

export interface DbConnectionConfig {
  connectionString: string;
  max?: number;
}

/**
 * Creates the single Kysely instance a process should use. Callers must connect via
 * APP_DATABASE_URL (the least-privileged `ehr_app` role — see migration 0001 and ADR-0001),
 * never the owner/bootstrap connection string, or Row-Level Security silently does nothing.
 */
export function createDb(config: DbConnectionConfig): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: config.connectionString, max: config.max ?? 10 }),
    }),
  });
}

/**
 * The ONLY sanctioned way to touch tenant-owned tables (enforced by .dependency-cruiser.cjs
 * forbidding raw `pg`/`kysely` imports outside this package). Opens a transaction, sets the
 * Postgres session variable Row-Level-Security policies key off (`app.tenant_id`, via
 * `set_config(..., is_local=true)` so it never leaks past this transaction), runs `fn`, commits.
 *
 * This is what makes tenant isolation structural rather than conventional (spec rule #3 /
 * §18.2 / success criterion #10): even a future code path that queries Postgres directly still
 * cannot see another tenant's rows, because the database itself enforces it independently of
 * whether the application layer's authz guard was applied correctly.
 */
export async function withTenantContext<T>(
  db: Kysely<DB>,
  tenantId: string,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new TypeError(`withTenantContext: "${tenantId}" is not a valid UUID tenant id`);
  }
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
    return fn(trx);
  });
}

/**
 * For platform/global tables that intentionally have no tenant_id (`tenants` itself, the
 * `roles`/`role_permissions` system catalog). Still transactional, but does not set
 * `app.tenant_id` — RLS policies on tenant-owned tables will therefore deny everything inside
 * this context, which is the correct failure mode if it's used by mistake on a tenant table.
 */
export async function withSystemContext<T>(
  db: Kysely<DB>,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(fn);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
