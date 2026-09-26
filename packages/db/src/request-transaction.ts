import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from './types.js';
import { withTenantContext } from './kysely.js';

const als = new AsyncLocalStorage<Transaction<DB>>();

/**
 * Opens ONE tenant-scoped transaction for the lifetime of `fn` and makes it available to
 * anything invoked within `fn`'s call stack via getCurrentTransaction() — without threading a
 * `trx` parameter through every controller/service/repository signature. This is what lets
 * apps/api's global AuditInterceptor write to `audit_events` in the SAME transaction as whatever
 * domain write the handler performed deep inside a service call (spec §7.1 / rule #12's
 * transactional-outbox guarantee applies to audit too — an audit row must not exist for a write
 * that got rolled back, or vice versa).
 *
 * apps/api's TenantContextMiddleware calls this once per authenticated request. Domain
 * repositories that run inside a request call getCurrentTransaction() instead of opening their
 * own transaction via withTenantContext directly. Code that is NOT running inside a request
 * (migrations, seeds, the outbox relay) continues to use withTenantContext/withSystemContext
 * directly, as before — this module only adds a way to *share* one transaction across a request,
 * it does not replace the lower-level primitives.
 */
export async function runWithRequestTransaction<T>(
  db: Kysely<DB>,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withTenantContext(db, tenantId, (trx) => als.run(trx, fn));
}

/** Throws if called outside runWithRequestTransaction — that's a bug at the call site, not a
 * recoverable condition, since it would otherwise silently open an unscoped connection. */
export function getCurrentTransaction(): Transaction<DB> {
  const trx = als.getStore();
  if (!trx) {
    throw new Error(
      'getCurrentTransaction() called outside runWithRequestTransaction() — is this running ' +
        'inside a request handled by TenantContextMiddleware?',
    );
  }
  return trx;
}

/** For tests: true if a request transaction is currently active on this async context. */
export function hasCurrentTransaction(): boolean {
  return als.getStore() !== undefined;
}
