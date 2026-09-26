import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ClaimVersionRow {
  id: string;
  tenantId: string;
  claimId: string;
  versionNumber: number;
  versionStatus: string;
  payload: Record<string, unknown>;
  clearinghouseTransactionId: string | null;
  submittedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ClaimVersionRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      claimId: string;
      versionNumber: number;
      versionStatus: string;
      payload: Record<string, unknown>;
      clearinghouseTransactionId: string | null;
      submittedAt: Date | null;
      createdBy: string;
    },
  ): Promise<ClaimVersionRow> {
    const row = await trx
      .insertInto('claim_versions')
      .values({
        tenant_id: input.tenantId,
        claim_id: input.claimId,
        version_number: input.versionNumber,
        version_status: input.versionStatus,
        payload: JSON.stringify(input.payload),
        clearinghouse_transaction_id: input.clearinghouseTransactionId,
        submitted_at: input.submittedAt,
        status: input.versionStatus,
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listByClaim(trx: Executor, tenantId: string, claimId: string): Promise<ClaimVersionRow[]> {
    const rows = await trx
      .selectFrom('claim_versions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('claim_id', '=', claimId)
      .orderBy('version_number', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['claim_versions']>): ClaimVersionRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    claimId: dbRow.claim_id,
    versionNumber: dbRow.version_number,
    versionStatus: dbRow.version_status,
    payload: dbRow.payload,
    clearinghouseTransactionId: dbRow.clearinghouse_transaction_id,
    submittedAt: dbRow.submitted_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
