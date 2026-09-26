import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface MedicationReconciliationEventRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  performedBy: string;
  performedAt: Date;
  notes: string | null;
  createdAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class MedicationReconciliationRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; patientId: string; encounterId: string; performedBy: string; notes: string | null; createdBy: string },
  ): Promise<MedicationReconciliationEventRow> {
    const row = await trx
      .insertInto('medication_reconciliation_events')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        performed_by: input.performedBy,
        notes: input.notes,
        status: 'completed',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<MedicationReconciliationEventRow[]> {
    const rows = await trx
      .selectFrom('medication_reconciliation_events')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('performed_at', 'desc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['medication_reconciliation_events']>): MedicationReconciliationEventRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    performedBy: dbRow.performed_by,
    performedAt: dbRow.performed_at,
    notes: dbRow.notes,
    createdAt: dbRow.created_at,
  };
}
