import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * The other half of the deferred Phase J SMART item: an interactive standalone-launch
 * authorization-code + PKCE flow, previously blocked on "needs a consent/patient-picker UI this
 * API-only build doesn't have" — that blocker is gone now that `apps/patient-portal` is real
 * (Tier 2 item 1). Deliberately scoped to standalone launch only (not EHR launch, which needs to
 * be embedded inside a host EHR's own UI with a launch-context token — a different, larger
 * feature) and to PKCE S256 only (no `plain` challenge method, no client that skips PKCE).
 *
 * `smart_clients` gains `redirect_uris` (an allowlist — the authorize endpoint 400s on anything
 * else) and `client_type` (confidential clients present a client_secret at token exchange; public
 * clients, e.g. a native mobile app, rely on PKCE alone) — every existing seeded client stays
 * 'confidential' by default, unaffected.
 *
 * `smart_authorization_codes` rows ARE the consent record — no separate "remember this app"
 * table exists, so every launch re-prompts the patient (a deliberate scope cut, not an oversight).
 * The row's own `id` (a v4 UUID — 122 bits of randomness) doubles as the authorization code
 * value; no separate opaque-token column is needed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('smart_clients')
    .addColumn('redirect_uris', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('client_type', 'text', (col) => col.notNull().defaultTo('confidential'))
    .execute();
  await db.schema
    .alterTable('smart_clients')
    .addCheckConstraint('smart_clients_client_type_check', sql`client_type in ('confidential', 'public')`)
    .execute();

  await withCommonColumns(db.schema.createTable('smart_authorization_codes'))
    .addColumn('client_id', 'text', (col) => col.notNull())
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('portal_account_id', 'uuid', (col) => col.notNull())
    .addColumn('scope', 'text', (col) => col.notNull())
    .addColumn('redirect_uri', 'text', (col) => col.notNull())
    .addColumn('code_challenge', 'text', (col) => col.notNull())
    .addColumn('code_challenge_method', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('consumed_at', 'timestamptz')
    .addForeignKeyConstraint('smart_authorization_codes_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('smart_authorization_codes_client_fk', ['client_id'], 'smart_clients', ['client_id'])
    .addForeignKeyConstraint('smart_authorization_codes_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('smart_authorization_codes_portal_account_fk', ['portal_account_id'], 'portal_accounts', ['id'])
    .addCheckConstraint('smart_authorization_codes_status_check', sql`status in ('issued', 'consumed')`)
    .addCheckConstraint('smart_authorization_codes_challenge_method_check', sql`code_challenge_method = 'S256'`)
    .execute();
  await sql`create index smart_authorization_codes_tenant_idx on smart_authorization_codes (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'smart_authorization_codes');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('smart_authorization_codes').ifExists().execute();
  await db.schema.alterTable('smart_clients').dropConstraint('smart_clients_client_type_check').execute();
  await db.schema.alterTable('smart_clients').dropColumn('redirect_uris').dropColumn('client_type').execute();
}
