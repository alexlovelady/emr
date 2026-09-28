import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface BulkExportOutputFile {
  type: string;
  storageKey: string;
  count: number;
}

export interface BulkExportJobRow {
  id: string;
  tenantId: string;
  requestedByClientId: string;
  resourceTypes: string[] | null;
  since: Date | null;
  outputFiles: BulkExportOutputFile[] | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class BulkExportJobRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; requestedByClientId: string; resourceTypes: string[] | null; since: Date | null },
  ): Promise<BulkExportJobRow> {
    const row = await trx
      .insertInto('bulk_export_jobs')
      .values({
        tenant_id: input.tenantId,
        requested_by_client_id: input.requestedByClientId,
        resource_types: input.resourceTypes,
        since: input.since,
        status: 'pending',
        created_by: null,
        updated_by: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<BulkExportJobRow | null> {
    const row = await trx
      .selectFrom('bulk_export_jobs')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  /** Cross-tenant — only ever called by `BulkExportRelay` over the owner/bootstrap connection. */
  async claimNextPending(trx: Executor): Promise<BulkExportJobRow | null> {
    const pending = await trx.selectFrom('bulk_export_jobs').selectAll().where('status', '=', 'pending').orderBy('created_at', 'asc').limit(1).executeTakeFirst();
    if (!pending) return null;
    const row = await trx
      .updateTable('bulk_export_jobs')
      .set({ status: 'in_progress', started_at: new Date(), updated_at: new Date() })
      .where('id', '=', pending.id)
      .where('tenant_id', '=', pending.tenant_id)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async complete(trx: Executor, tenantId: string, id: string, outputFiles: BulkExportOutputFile[]): Promise<BulkExportJobRow> {
    const row = await trx
      .updateTable('bulk_export_jobs')
      .set({ status: 'completed', output_files: JSON.stringify(outputFiles), completed_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async fail(trx: Executor, tenantId: string, id: string, error: string): Promise<BulkExportJobRow> {
    const row = await trx
      .updateTable('bulk_export_jobs')
      .set({ status: 'failed', error, completed_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['bulk_export_jobs']>): BulkExportJobRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    requestedByClientId: dbRow.requested_by_client_id,
    resourceTypes: dbRow.resource_types,
    since: dbRow.since,
    outputFiles: dbRow.output_files,
    error: dbRow.error,
    startedAt: dbRow.started_at,
    completedAt: dbRow.completed_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
