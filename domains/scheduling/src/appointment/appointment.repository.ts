import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface AppointmentRow {
  id: string;
  tenantId: string;
  patientId: string;
  locationId: string;
  practitionerId: string;
  appointmentType: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  noShowAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class AppointmentRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      locationId: string;
      practitionerId: string;
      appointmentType: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      createdBy: string;
    },
  ): Promise<AppointmentRow> {
    const row = await trx
      .insertInto('appointments')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        location_id: input.locationId,
        practitioner_id: input.practitionerId,
        appointment_type: input.appointmentType,
        scheduled_start: input.scheduledStart,
        scheduled_end: input.scheduledEnd,
        status: 'scheduled',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<AppointmentRow | null> {
    const row = await trx
      .selectFrom('appointments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(
    trx: Executor,
    tenantId: string,
    filter: { patientId?: string; scheduledFrom?: Date; scheduledTo?: Date } = {},
  ): Promise<AppointmentRow[]> {
    let query = trx.selectFrom('appointments').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) {
      query = query.where('patient_id', '=', filter.patientId);
    }
    if (filter.scheduledFrom) {
      query = query.where('scheduled_start', '>=', filter.scheduledFrom);
    }
    if (filter.scheduledTo) {
      query = query.where('scheduled_start', '<', filter.scheduledTo);
    }
    const rows = await query.orderBy('scheduled_start', 'asc').execute();
    return rows.map(toRow);
  }

  /** Applies a state transition, checking `expectedStatuses` optimistically against the row already read. */
  async transition(
    trx: Executor,
    tenantId: string,
    id: string,
    newStatus: string,
    patch: Partial<{
      confirmed_at: Date;
      checked_in_at: Date;
      cancelled_at: Date;
      cancellation_reason: string;
      no_show_at: Date;
    }>,
    updatedBy: string,
  ): Promise<AppointmentRow> {
    const row = await trx
      .updateTable('appointments')
      .set({ ...patch, status: newStatus, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['appointments']>): AppointmentRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    locationId: dbRow.location_id,
    practitionerId: dbRow.practitioner_id,
    appointmentType: dbRow.appointment_type,
    scheduledStart: dbRow.scheduled_start,
    scheduledEnd: dbRow.scheduled_end,
    confirmedAt: dbRow.confirmed_at,
    checkedInAt: dbRow.checked_in_at,
    cancelledAt: dbRow.cancelled_at,
    cancellationReason: dbRow.cancellation_reason,
    noShowAt: dbRow.no_show_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
