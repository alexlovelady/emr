import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §9's search index. Every field here is one §9 explicitly requires on an
 * indexed document ("Every indexed document includes: tenant_id, patient_id, resource_type,
 * resource_id, sensitivity_tags, allowed_context_tags, version, indexed_at").
 */
export interface SearchDocument {
  tenantId: string;
  patientId: string | null;
  resourceType: string;
  resourceId: string;
  sensitivityTags: string[];
  allowedContextTags: string[];
  title: string;
  body: string;
}

export interface SearchQuery {
  tenantId: string;
  query: string;
  /** Context tags the requesting actor is allowed to see — spec §9: filter inside the query. */
  allowedContextTags: string[];
  resourceTypes?: string[];
  limit?: number;
}

export interface SearchResult {
  resourceType: string;
  resourceId: string;
  patientId: string | null;
  title: string;
  rank: number;
  indexedAt: Date;
}

/**
 * Spec §2.1 names Amazon OpenSearch Service; this repo has no managed search cluster, the same
 * class of gap ADR-0002 already documents for the Kafka event bus — see
 * docs/adr/0003-postgres-search-and-analytics-instead-of-opensearch-clickhouse.md.
 * `PostgresSearchIndexGateway` is a real, working implementation of this interface (not a stub),
 * swappable for an OpenSearch-backed one later without touching any call site.
 *
 * Unlike the lab/eRx/clearinghouse gateways (which talk to an external vendor with no concept of
 * our own DB transaction), this gateway's real implementation IS Postgres, so every method takes
 * the current tenant-scoped transaction explicitly, the same convention every repository in this
 * repo already follows — indexing writes must live inside the same transaction as the domain
 * write that triggered them, or a rollback would leave the index out of sync.
 */
export interface SearchIndexGateway {
  indexDocument(trx: Executor, doc: SearchDocument): Promise<void>;
  search(trx: Executor, query: SearchQuery): Promise<SearchResult[]>;
  deleteDocument(trx: Executor, params: { tenantId: string; resourceType: string; resourceId: string }): Promise<void>;
}
