import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ExportRequestRow {
  id: string;
  tenantId: string;
  patientId: string;
  requestedByPortalAccountId: string;
  storageKey: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ExportRequestRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; patientId: string; requestedByPortalAccountId: string; storageKey: string; status: string },
  ): Promise<ExportRequestRow> {
    const row = await trx
      .insertInto('export_requests')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        requested_by_portal_account_id: input.requestedByPortalAccountId,
        storage_key: input.storageKey,
        status: input.status,
        created_by: input.requestedByPortalAccountId,
        updated_by: input.requestedByPortalAccountId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ExportRequestRow | null> {
    const row = await trx
      .selectFrom('export_requests')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ExportRequestRow[]> {
    const rows = await trx
      .selectFrom('export_requests')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['export_requests']>): ExportRequestRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    requestedByPortalAccountId: dbRow.requested_by_portal_account_id,
    storageKey: dbRow.storage_key,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
