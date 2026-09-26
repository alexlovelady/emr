import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface EligibilityCheckRow {
  id: string;
  tenantId: string;
  patientId: string;
  coverageId: string;
  isEligible: boolean;
  copayAmount: string | null;
  deductibleRemaining: string | null;
  rawResponse: Record<string, unknown>;
  checkedAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class EligibilityRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      coverageId: string;
      isEligible: boolean;
      copayAmount: string | null;
      deductibleRemaining: string | null;
      rawResponse: Record<string, unknown>;
      createdBy: string;
    },
  ): Promise<EligibilityCheckRow> {
    const row = await trx
      .insertInto('eligibility_checks')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        coverage_id: input.coverageId,
        is_eligible: input.isEligible,
        copay_amount: input.copayAmount,
        deductible_remaining: input.deductibleRemaining,
        raw_response: JSON.stringify(input.rawResponse),
        status: 'checked',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<EligibilityCheckRow[]> {
    const rows = await trx
      .selectFrom('eligibility_checks')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('checked_at', 'desc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['eligibility_checks']>): EligibilityCheckRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    coverageId: dbRow.coverage_id,
    isEligible: dbRow.is_eligible,
    copayAmount: dbRow.copay_amount,
    deductibleRemaining: dbRow.deductible_remaining,
    rawResponse: dbRow.raw_response,
    checkedAt: dbRow.checked_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
