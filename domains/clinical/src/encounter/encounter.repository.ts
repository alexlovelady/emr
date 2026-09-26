import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface EncounterRow {
  id: string;
  tenantId: string;
  patientId: string;
  appointmentId: string;
  locationId: string;
  practitionerId: string;
  encounterType: string;
  startedAt: Date;
  endedAt: Date | null;
  chiefComplaint: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class EncounterRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      appointmentId: string;
      locationId: string;
      practitionerId: string;
      encounterType: string;
      chiefComplaint: string | null;
      createdBy: string;
    },
  ): Promise<EncounterRow> {
    const row = await trx
      .insertInto('encounters')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        appointment_id: input.appointmentId,
        location_id: input.locationId,
        practitioner_id: input.practitionerId,
        encounter_type: input.encounterType,
        chief_complaint: input.chiefComplaint,
        status: 'roomed',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<EncounterRow | null> {
    const row = await trx
      .selectFrom('encounters')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string, filter: { patientId?: string } = {}): Promise<EncounterRow[]> {
    let query = trx.selectFrom('encounters').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) query = query.where('patient_id', '=', filter.patientId);
    const rows = await query.orderBy('started_at', 'desc').execute();
    return rows.map(toRow);
  }

  async transition(
    trx: Executor,
    tenantId: string,
    id: string,
    newStatus: string,
    patch: Partial<{ ended_at: Date }>,
    updatedBy: string,
  ): Promise<EncounterRow> {
    const row = await trx
      .updateTable('encounters')
      .set({ ...patch, status: newStatus, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['encounters']>): EncounterRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    appointmentId: dbRow.appointment_id,
    locationId: dbRow.location_id,
    practitionerId: dbRow.practitioner_id,
    encounterType: dbRow.encounter_type,
    startedAt: dbRow.started_at,
    endedAt: dbRow.ended_at,
    chiefComplaint: dbRow.chief_complaint,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
