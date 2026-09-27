import { Kysely } from 'kysely';

/**
 * `locations` had no address columns at all (confirmed absent in migration 0003) — added here as
 * part of the eCW/athenahealth parity roadmap's admin-web completeness pass. All nullable: existing
 * locations have no address on file, and this isn't a required field for the domain to function.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('locations')
    .addColumn('address_line1', 'text')
    .addColumn('address_line2', 'text')
    .addColumn('city', 'text')
    .addColumn('state', 'text')
    .addColumn('postal_code', 'text')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('locations')
    .dropColumn('address_line1')
    .dropColumn('address_line2')
    .dropColumn('city')
    .dropColumn('state')
    .dropColumn('postal_code')
    .execute();
}
