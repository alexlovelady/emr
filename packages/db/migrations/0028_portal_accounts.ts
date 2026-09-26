import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * The first patient-facing identity in this repo (EHR_BUILD_SPEC.md §17). Deliberately NOT a row
 * in `users` — portal accounts have no `user_roles`/`role_permissions` membership at all (spec
 * §6.2's role-permission layer is staff-only); they authenticate via a wholly separate token pair
 * (`packages/auth-adapter`'s `signPortalAccessToken`) and are authorized via `@ehr/consent`'s
 * proxy-grant model, not `@ehr/authz`'s PolicyEngine. See README's Phase 8 scope decisions.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('portal_accounts'))
    .addColumn('email', sql`citext`, (col) => col.notNull())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('mfa_enrolled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('last_login_at', 'timestamptz')
    .addForeignKeyConstraint('portal_accounts_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index portal_accounts_tenant_idx on portal_accounts (tenant_id)`.execute(db);
  await sql`create unique index portal_accounts_tenant_email_unique on portal_accounts (tenant_id, email)`.execute(db);
  await enableTenantIsolation(db, 'portal_accounts');

  await withCommonColumns(db.schema.createTable('portal_refresh_tokens'))
    .addColumn('portal_account_id', 'uuid', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addForeignKeyConstraint('portal_refresh_tokens_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('portal_refresh_tokens_account_fk', ['portal_account_id'], 'portal_accounts', ['id'])
    .addUniqueConstraint('portal_refresh_tokens_token_hash_unique', ['token_hash'])
    .execute();
  await sql`create index portal_refresh_tokens_tenant_idx on portal_refresh_tokens (tenant_id)`.execute(db);
  await sql`create index portal_refresh_tokens_account_idx on portal_refresh_tokens (portal_account_id)`.execute(db);
  await enableTenantIsolation(db, 'portal_refresh_tokens');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('portal_refresh_tokens').ifExists().execute();
  await db.schema.dropTable('portal_accounts').ifExists().execute();
}
