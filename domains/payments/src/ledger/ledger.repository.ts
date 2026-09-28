import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface LedgerEntryRow {
  id: string;
  tenantId: string;
  patientId: string;
  claimId: string | null;
  entryType: string;
  amount: string;
  description: string;
  occurredAt: Date;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentPlanInstallmentId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class LedgerRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      claimId: string | null;
      entryType: string;
      amount: string;
      description: string;
      createdBy: string;
      paymentMethod?: string | null;
      paymentReference?: string | null;
      paymentPlanInstallmentId?: string | null;
    },
  ): Promise<LedgerEntryRow> {
    const row = await trx
      .insertInto('ledger_entries')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        claim_id: input.claimId,
        entry_type: input.entryType,
        amount: input.amount,
        description: input.description,
        payment_method: input.paymentMethod ?? null,
        payment_reference: input.paymentReference ?? null,
        payment_plan_installment_id: input.paymentPlanInstallmentId ?? null,
        status: 'posted',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<LedgerEntryRow[]> {
    const rows = await trx
      .selectFrom('ledger_entries')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('occurred_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['ledger_entries']>): LedgerEntryRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    claimId: dbRow.claim_id,
    entryType: dbRow.entry_type,
    amount: dbRow.amount,
    description: dbRow.description,
    occurredAt: dbRow.occurred_at,
    paymentMethod: dbRow.payment_method,
    paymentReference: dbRow.payment_reference,
    paymentPlanInstallmentId: dbRow.payment_plan_installment_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
