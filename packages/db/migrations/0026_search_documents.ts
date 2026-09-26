import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * EHR_BUILD_SPEC.md §9's search index, backed by real Postgres full-text search
 * (`tsvector`/GIN) rather than the spec's named Amazon OpenSearch — see
 * docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md. Every indexed
 * document carries exactly the fields §9 requires ("Every indexed document includes: tenant_id,
 * patient_id, resource_type, resource_id, sensitivity_tags, allowed_context_tags, version,
 * indexed_at") so authorization can filter *inside* the search query, never by post-filtering a
 * retrieved candidate list (spec's explicit rule).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('search_documents'))
    .addColumn('patient_id', 'uuid')
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('resource_id', 'uuid', (col) => col.notNull())
    .addColumn('sensitivity_tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('allowed_context_tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addForeignKeyConstraint('search_documents_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('search_documents_patient_fk', ['patient_id'], 'patients', ['id'])
    .execute();

  await sql`
    alter table search_documents
      add column search_vector tsvector
        generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) stored
  `.execute(db);

  await sql`create unique index search_documents_tenant_resource_unique on search_documents (tenant_id, resource_type, resource_id)`.execute(
    db,
  );
  await sql`create index search_documents_search_vector_idx on search_documents using gin (search_vector)`.execute(db);
  await sql`create index search_documents_tenant_idx on search_documents (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'search_documents');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('search_documents').ifExists().execute();
}
