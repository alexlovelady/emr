import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PatientMergeHistoryRow {
  id: string;
  tenantId: string;
  sourcePatientId: string;
  targetPatientId: string;
  mergedBy: string;
  mergeReason: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  createdAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PatientMergeHistoryRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; sourcePatientId: string; targetPatientId: string; mergedBy: string; mergeReason: string | null },
  ): Promise<PatientMergeHistoryRow> {
    const row = await trx
      .insertInto('patient_merge_history')
      .values({
        tenant_id: input.tenantId,
        source_patient_id: input.sourcePatientId,
        target_patient_id: input.targetPatientId,
        merged_by: input.mergedBy,
        merge_reason: input.mergeReason,
        status: 'completed',
        created_by: input.mergedBy,
        updated_by: input.mergedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PatientMergeHistoryRow | null> {
    const row = await trx
      .selectFrom('patient_merge_history')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async markReversed(trx: Executor, tenantId: string, id: string, reversedBy: string): Promise<PatientMergeHistoryRow> {
    const row = await trx
      .updateTable('patient_merge_history')
      .set({ reversed_at: new Date(), reversed_by: reversedBy, updated_by: reversedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['patient_merge_history']>): PatientMergeHistoryRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    sourcePatientId: dbRow.source_patient_id,
    targetPatientId: dbRow.target_patient_id,
    mergedBy: dbRow.merged_by,
    mergeReason: dbRow.merge_reason,
    reversedAt: dbRow.reversed_at,
    reversedBy: dbRow.reversed_by,
    createdAt: dbRow.created_at,
  };
}
