import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ClaimRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  coverageId: string | null;
  billingPractitionerId: string;
  totalChargeAmount: string;
  currentVersion: number;
  clearinghouseTransactionId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ClaimRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string;
      coverageId: string | null;
      billingPractitionerId: string;
      totalChargeAmount: string;
      createdBy: string;
    },
  ): Promise<ClaimRow> {
    const row = await trx
      .insertInto('claims')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        coverage_id: input.coverageId,
        billing_practitioner_id: input.billingPractitionerId,
        total_charge_amount: input.totalChargeAmount,
        current_version: 1,
        status: 'draft',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ClaimRow | null> {
    const row = await trx.selectFrom('claims').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ClaimRow[]> {
    const rows = await trx
      .selectFrom('claims')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  /**
   * Cross-tenant lookup by the clearinghouse's own transaction id — used ONLY by
   * `apps/webhook-gateway`'s owner-role connection to discover which tenant an inbound 277CA/835
   * belongs to before switching into a tenant-scoped transaction. Never call with an app-role
   * connection (RLS would just return nothing, which is the point — this bypasses RLS on purpose).
   */
  async findByTransactionIdGlobal(ownerDb: Kysely<DB>, clearinghouseTransactionId: string): Promise<ClaimRow | null> {
    const row = await ownerDb
      .selectFrom('claims')
      .selectAll()
      .where('clearinghouse_transaction_id', '=', clearinghouseTransactionId)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<ClaimRow> {
    const row = await trx
      .updateTable('claims')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async recordSubmission(
    trx: Executor,
    tenantId: string,
    id: string,
    input: { currentVersion: number; clearinghouseTransactionId: string; status: string },
    updatedBy: string,
  ): Promise<ClaimRow> {
    const row = await trx
      .updateTable('claims')
      .set({
        current_version: input.currentVersion,
        clearinghouse_transaction_id: input.clearinghouseTransactionId,
        status: input.status,
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

function toRow(dbRow: Selectable<DB['claims']>): ClaimRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    coverageId: dbRow.coverage_id,
    billingPractitionerId: dbRow.billing_practitioner_id,
    totalChargeAmount: dbRow.total_charge_amount,
    currentVersion: dbRow.current_version,
    clearinghouseTransactionId: dbRow.clearinghouse_transaction_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
