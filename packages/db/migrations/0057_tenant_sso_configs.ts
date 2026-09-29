import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Item 23 of the post-Tier-2 gap sweep: ADR-0002's SSO-readiness seam ("expect to add a second
 * `IdentityProvider` implementation... when Auth0/Okta/Cognito is eventually integrated") plus a
 * per-tenant switch to turn it on — no real IdP is integrated here (see
 * `packages/auth-adapter/src/sso.ts`'s `NoopSsoAssertionVerifier`), so `enabled` defaults false and
 * nothing calls this table until a tenant admin explicitly configures + enables one. One row per
 * tenant for v1 (a tenant federating to exactly one IdP) — `protocol` picks which
 * `SsoAssertionVerifier` handles it. Tenant-scoped and RLS-enabled like `users`, but looked up the
 * same two-phase way `FirstPartyIdentityProvider.resolveUser` already looks up `users`: tenant by
 * slug via the system context, then this table via the resolved tenant's own context — there is no
 * authenticated session yet when a federated login begins.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('tenant_sso_configs'))
    .addColumn('protocol', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('issuer', 'text', (col) => col.notNull())
    .addColumn('client_id', 'text')
    .addColumn('metadata_url', 'text')
    .addForeignKeyConstraint('tenant_sso_configs_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addUniqueConstraint('tenant_sso_configs_tenant_unique', ['tenant_id'])
    .addCheckConstraint('tenant_sso_configs_protocol_check', sql`protocol in ('oidc', 'saml')`)
    .execute();
  await enableTenantIsolation(db, 'tenant_sso_configs');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tenant_sso_configs').ifExists().execute();
}
