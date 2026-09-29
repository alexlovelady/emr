import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface DenialRow {
  id: string;
  tenantId: string;
  claimId: string;
  denialReasonCode: string;
  denialReasonText: string;
  deniedAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  taskId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class DenialRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      claimId: string;
      denialReasonCode: string;
      denialReasonText: string;
      taskId: string | null;
      createdBy: string;
    },
  ): Promise<DenialRow> {
    const row = await trx
      .insertInto('denials')
      .values({
        tenant_id: input.tenantId,
        claim_id: input.claimId,
        denial_reason_code: input.denialReasonCode,
        denial_reason_text: input.denialReasonText,
        task_id: input.taskId,
        status: 'open',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<DenialRow | null> {
    const row = await trx.selectFrom('denials').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByClaim(trx: Executor, tenantId: string, claimId: string): Promise<DenialRow[]> {
    const rows = await trx
      .selectFrom('denials')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('claim_id', '=', claimId)
      .orderBy('denied_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  /** Denials have no `patient_id` of their own — joins through `claims` rather than making the
   * caller flatten every claim's own timeline (the N+1 pattern this replaces). */
  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<DenialRow[]> {
    const rows = await trx
      .selectFrom('denials')
      .innerJoin('claims', 'claims.id', 'denials.claim_id')
      .selectAll('denials')
      .where('denials.tenant_id', '=', tenantId)
      .where('claims.patient_id', '=', patientId)
      .orderBy('denials.denied_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async updateStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<DenialRow> {
    const row = await trx
      .updateTable('denials')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async resolve(trx: Executor, tenantId: string, id: string, resolutionNotes: string, updatedBy: string): Promise<DenialRow> {
    const row = await trx
      .updateTable('denials')
      .set({
        status: 'resolved',
        resolved_at: new Date(),
        resolution_notes: resolutionNotes,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['denials']>): DenialRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    claimId: dbRow.claim_id,
    denialReasonCode: dbRow.denial_reason_code,
    denialReasonText: dbRow.denial_reason_text,
    deniedAt: dbRow.denied_at,
    resolvedAt: dbRow.resolved_at,
    resolutionNotes: dbRow.resolution_notes,
    taskId: dbRow.task_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
