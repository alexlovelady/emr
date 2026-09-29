import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface AppealRow {
  id: string;
  tenantId: string;
  claimId: string;
  denialId: string;
  appealReason: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decisionNotes: string | null;
  sourceAiGenerationId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class AppealRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      claimId: string;
      denialId: string;
      appealReason: string;
      sourceAiGenerationId: string | null;
      createdBy: string;
    },
  ): Promise<AppealRow> {
    const row = await trx
      .insertInto('appeals')
      .values({
        tenant_id: input.tenantId,
        claim_id: input.claimId,
        denial_id: input.denialId,
        appeal_reason: input.appealReason,
        source_ai_generation_id: input.sourceAiGenerationId,
        status: 'draft',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<AppealRow | null> {
    const row = await trx.selectFrom('appeals').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByDenial(trx: Executor, tenantId: string, denialId: string): Promise<AppealRow[]> {
    const rows = await trx
      .selectFrom('appeals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('denial_id', '=', denialId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async listByClaim(trx: Executor, tenantId: string, claimId: string): Promise<AppealRow[]> {
    const rows = await trx
      .selectFrom('appeals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('claim_id', '=', claimId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  /** Appeals have no `patient_id` of their own — joins through `claims`, same reasoning as
   * `DenialRepository.listByPatient()`. */
  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<AppealRow[]> {
    const rows = await trx
      .selectFrom('appeals')
      .innerJoin('claims', 'claims.id', 'appeals.claim_id')
      .selectAll('appeals')
      .where('appeals.tenant_id', '=', tenantId)
      .where('claims.patient_id', '=', patientId)
      .orderBy('appeals.created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async markSubmitted(trx: Executor, tenantId: string, id: string, updatedBy: string): Promise<AppealRow> {
    const row = await trx
      .updateTable('appeals')
      .set({ status: 'submitted', submitted_at: new Date(), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async decide(trx: Executor, tenantId: string, id: string, outcome: 'won' | 'lost', decisionNotes: string, updatedBy: string): Promise<AppealRow> {
    const row = await trx
      .updateTable('appeals')
      .set({ status: outcome, decided_at: new Date(), decision_notes: decisionNotes, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['appeals']>): AppealRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    claimId: dbRow.claim_id,
    denialId: dbRow.denial_id,
    appealReason: dbRow.appeal_reason,
    submittedAt: dbRow.submitted_at,
    decidedAt: dbRow.decided_at,
    decisionNotes: dbRow.decision_notes,
    sourceAiGenerationId: dbRow.source_ai_generation_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
