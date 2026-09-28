import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface DocumentRow {
  id: string;
  tenantId: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  storageKey: string;
  patientId: string | null;
  encounterId: string | null;
  documentCategory: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class DocumentRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      filename: string;
      contentType: string;
      storageKey: string;
      patientId: string | null;
      encounterId: string | null;
      documentCategory: string | null;
      createdBy: string;
    },
  ): Promise<DocumentRow> {
    const row = await trx
      .insertInto('documents')
      .values({
        tenant_id: input.tenantId,
        filename: input.filename,
        content_type: input.contentType,
        storage_key: input.storageKey,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        document_category: input.documentCategory,
        status: 'pending_upload',
        uploaded_by: input.createdBy,
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<DocumentRow | null> {
    const row = await trx
      .selectFrom('documents')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string, filter: { patientId?: string; since?: Date } = {}): Promise<DocumentRow[]> {
    let query = trx.selectFrom('documents').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) query = query.where('patient_id', '=', filter.patientId);
    if (filter.since) query = query.where('updated_at', '>=', filter.since);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map(toRow);
  }

  async markStored(trx: Executor, tenantId: string, id: string, sizeBytes: number): Promise<DocumentRow> {
    const row = await trx
      .updateTable('documents')
      .set({ status: 'stored', size_bytes: String(sizeBytes) })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['documents']>): DocumentRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    filename: dbRow.filename,
    contentType: dbRow.content_type,
    sizeBytes: dbRow.size_bytes === null ? null : Number(dbRow.size_bytes),
    storageKey: dbRow.storage_key,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    documentCategory: dbRow.document_category,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
