import { Kysely } from 'kysely';

/**
 * Epic-parity item 4 — a SMART-app catalog page needs something to actually display besides a raw
 * client_id: a description, who built it, and a logo. `smart_clients` had none of these (only
 * `display_name`), so admin registration/browsing had nothing to render. Per-tenant, not a global
 * cross-tenant marketplace — `smart_clients` already has tenant-scoped RLS, and a real shared
 * third-party-app directory would need vendor submission/certification (network-effect/vendor-gated,
 * out of scope, same reasoning as Care Everywhere/Cosmos/App Orchard's installed-base scale).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('smart_clients')
    .addColumn('description', 'text')
    .addColumn('developer_name', 'text')
    .addColumn('website_url', 'text')
    .addColumn('logo_url', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('smart_clients')
    .dropColumn('description')
    .dropColumn('developer_name')
    .dropColumn('website_url')
    .dropColumn('logo_url')
    .execute();
}
