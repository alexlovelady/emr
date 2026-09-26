import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface RemittanceRow {
  id: string;
  tenantId: string;
  claimId: string;
  claimVersionId: string;
  payerPaidAmount: string;
  adjustmentAmount: string;
  patientResponsibilityAmount: string;
  remittanceAdviceNumber: string | null;
  rawPayload: Record<string, unknown>;
  postedAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class RemittanceRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      claimId: string;
      claimVersionId: string;
      payerPaidAmount: string;
      adjustmentAmount: string;
      patientResponsibilityAmount: string;
      remittanceAdviceNumber: string | null;
      rawPayload: Record<string, unknown>;
      createdBy: string;
    },
  ): Promise<RemittanceRow> {
    const row = await trx
      .insertInto('remittances')
      .values({
        tenant_id: input.tenantId,
        claim_id: input.claimId,
        claim_version_id: input.claimVersionId,
        payer_paid_amount: input.payerPaidAmount,
        adjustment_amount: input.adjustmentAmount,
        patient_responsibility_amount: input.patientResponsibilityAmount,
        remittance_advice_number: input.remittanceAdviceNumber,
        raw_payload: JSON.stringify(input.rawPayload),
        status: 'posted',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findByClaimAndAdviceNumber(
    trx: Executor,
    tenantId: string,
    claimId: string,
    remittanceAdviceNumber: string,
  ): Promise<RemittanceRow | null> {
    const row = await trx
      .selectFrom('remittances')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('claim_id', '=', claimId)
      .where('remittance_advice_number', '=', remittanceAdviceNumber)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByClaim(trx: Executor, tenantId: string, claimId: string): Promise<RemittanceRow[]> {
    const rows = await trx
      .selectFrom('remittances')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('claim_id', '=', claimId)
      .orderBy('posted_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['remittances']>): RemittanceRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    claimId: dbRow.claim_id,
    claimVersionId: dbRow.claim_version_id,
    payerPaidAmount: dbRow.payer_paid_amount,
    adjustmentAmount: dbRow.adjustment_amount,
    patientResponsibilityAmount: dbRow.patient_responsibility_amount,
    remittanceAdviceNumber: dbRow.remittance_advice_number,
    rawPayload: dbRow.raw_payload,
    postedAt: dbRow.posted_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
