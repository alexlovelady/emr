import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Item 23: links a verified federated assertion's subject id to an existing local `users` row —
 * see `packages/auth-adapter/src/federated-identity-provider.ts`. Deliberately link-only, never
 * provisioning-capable: `FederatedIdentityProvider` only ever creates a row here for a user that
 * already exists (matched by email on first login), so SSO can never grant access beyond what an
 * administrator already set up through the normal user-creation path. `external_subject_id` is
 * whatever stable identifier the IdP's own verified assertion carries (e.g. an OIDC `sub` claim or
 * a SAML NameID) — opaque to this table.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('external_identities'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('protocol', 'text', (col) => col.notNull())
    .addColumn('external_subject_id', 'text', (col) => col.notNull())
    .addColumn('linked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('external_identities_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('external_identities_user_fk', ['user_id'], 'users', ['id'])
    .addUniqueConstraint('external_identities_subject_unique', ['tenant_id', 'protocol', 'external_subject_id'])
    .addCheckConstraint('external_identities_protocol_check', sql`protocol in ('oidc', 'saml')`)
    .execute();
  await sql`create index external_identities_user_idx on external_identities (tenant_id, user_id)`.execute(db);
  await enableTenantIsolation(db, 'external_identities');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('external_identities').ifExists().execute();
}
