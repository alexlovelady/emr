import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface MedicationRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string | null;
  medicationName: string;
  rxnormCode: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  sourceType: string;
  startedAt: string | null;
  stoppedAt: string | null;
  prescriberId: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class MedicationRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string | null;
      medicationName: string;
      rxnormCode: string | null;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      sourceType: string;
      startedAt: string | null;
      prescriberId: string | null;
      notes: string | null;
      createdBy: string;
    },
  ): Promise<MedicationRow> {
    const row = await trx
      .insertInto('medications')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        medication_name: input.medicationName,
        rxnorm_code: input.rxnormCode,
        dose: input.dose,
        route: input.route,
        frequency: input.frequency,
        entry_source: input.sourceType,
        started_at: input.startedAt,
        prescriber_id: input.prescriberId,
        notes: input.notes,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<MedicationRow | null> {
    const row = await trx
      .selectFrom('medications')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<MedicationRow[]> {
    const rows = await trx
      .selectFrom('medications')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async setStatus(
    trx: Executor,
    tenantId: string,
    id: string,
    status: string,
    stoppedAt: string | null,
    updatedBy: string,
  ): Promise<MedicationRow> {
    const row = await trx
      .updateTable('medications')
      .set({ status, stopped_at: stoppedAt, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['medications']>): MedicationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    medicationName: dbRow.medication_name,
    rxnormCode: dbRow.rxnorm_code,
    dose: dbRow.dose,
    route: dbRow.route,
    frequency: dbRow.frequency,
    sourceType: dbRow.entry_source,
    startedAt: formatDate(dbRow.started_at),
    stoppedAt: formatDate(dbRow.stopped_at),
    prescriberId: dbRow.prescriber_id,
    notes: dbRow.notes,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}
