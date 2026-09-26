import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { SearchDocument, SearchIndexGateway, SearchQuery, SearchResult } from './search-index-gateway.js';

type Executor = Kysely<DB> | Transaction<DB>;

/** Real Postgres full-text search (`tsvector`/GIN) — see search-index-gateway.ts's doc comment. */
export class PostgresSearchIndexGateway implements SearchIndexGateway {
  async indexDocument(trx: Executor, doc: SearchDocument): Promise<void> {
    await trx
      .insertInto('search_documents')
      .values({
        tenant_id: doc.tenantId,
        patient_id: doc.patientId,
        resource_type: doc.resourceType,
        resource_id: doc.resourceId,
        sensitivity_tags: doc.sensitivityTags,
        allowed_context_tags: doc.allowedContextTags,
        title: doc.title,
        body: doc.body,
        status: 'active',
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'resource_type', 'resource_id']).doUpdateSet({
          patient_id: doc.patientId,
          sensitivity_tags: doc.sensitivityTags,
          allowed_context_tags: doc.allowedContextTags,
          title: doc.title,
          body: doc.body,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  /**
   * Spec §9: "Search filters authorization inside the search query. Do not retrieve unauthorized
   * candidates and filter afterward." `sensitivity_tags <@ $allowedContextTags` (Postgres array
   * containment) means a document with no sensitivity tags is always visible, and a tagged one is
   * only visible if every one of its tags is among the caller's allowed context tags — evaluated
   * directly in the WHERE clause, never as a post-fetch filter.
   */
  async search(trx: Executor, query: SearchQuery): Promise<SearchResult[]> {
    const limit = query.limit ?? 25;
    const resourceTypeFilter = query.resourceTypes && query.resourceTypes.length > 0 ? query.resourceTypes : null;

    const result = await sql<{
      resource_type: string;
      resource_id: string;
      patient_id: string | null;
      title: string;
      rank: number;
      indexed_at: Date;
    }>`
      select resource_type, resource_id, patient_id, title,
             ts_rank(search_vector, websearch_to_tsquery('english', ${query.query})) as rank,
             created_at as indexed_at
      from search_documents
      where tenant_id = ${query.tenantId}
        and sensitivity_tags <@ ${sql.val(query.allowedContextTags)}::text[]
        and search_vector @@ websearch_to_tsquery('english', ${query.query})
        ${resourceTypeFilter ? sql`and resource_type = any(${sql.val(resourceTypeFilter)}::text[])` : sql``}
      order by rank desc
      limit ${limit}
    `.execute(trx);

    return result.rows.map((row) => ({
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      patientId: row.patient_id,
      title: row.title,
      rank: Number(row.rank),
      indexedAt: row.indexed_at,
    }));
  }

  async deleteDocument(trx: Executor, params: { tenantId: string; resourceType: string; resourceId: string }): Promise<void> {
    await trx
      .deleteFrom('search_documents')
      .where('tenant_id', '=', params.tenantId)
      .where('resource_type', '=', params.resourceType)
      .where('resource_id', '=', params.resourceId)
      .execute();
  }
}
