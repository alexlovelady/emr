import { Kysely, sql } from 'kysely';

/**
 * Phase M (eCW/athena parity roadmap): a global reference-data catalog — no tenant_id, no RLS,
 * same posture as migration 0005's `roles`/`role_permissions` ("global system catalog... seeded
 * once, not tenant-managed"). Rows come from a one-time load of the downloaded RxNorm/ICD-10-CM
 * flat files (`packages/terminology`'s seed script), not from application request traffic.
 *
 * `display` gets a generated `tsvector` + GIN index for real full-text search, mirroring
 * migration 0026's `search_documents` pattern, rather than an ILIKE scan over a few hundred
 * thousand rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('terminology_codes')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('system', 'text', (col) => col.notNull())
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('display', 'text', (col) => col.notNull())
    .addColumn('billable', 'boolean')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`create unique index terminology_codes_system_code_unique on terminology_codes (system, code)`.execute(db);

  await sql`
    alter table terminology_codes
      add column search_vector tsvector
        generated always as (to_tsvector('english', display)) stored
  `.execute(db);
  await sql`create index terminology_codes_search_vector_idx on terminology_codes using gin (search_vector)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('terminology_codes').ifExists().execute();
}
