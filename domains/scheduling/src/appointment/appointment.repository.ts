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
  seriesId: string | null;
  recurrenceRule: Record<string, unknown> | null;
  waitlistedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** Statuses that actually hold a practitioner/resource slot — a cancelled, no-show, or
 * waitlisted appointment must never block a new booking for the same time. */
const BLOCKING_STATUSES = ['scheduled', 'confirmed', 'checked_in'];

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
      seriesId?: string;
      recurrenceRule?: Record<string, unknown>;
      status?: string;
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
        status: input.status ?? 'scheduled',
        series_id: input.seriesId ?? null,
        recurrence_rule: input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : null,
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
    filter: { patientId?: string; practitionerId?: string; locationId?: string; scheduledFrom?: Date; scheduledTo?: Date } = {},
  ): Promise<AppointmentRow[]> {
    let query = trx.selectFrom('appointments').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) {
      query = query.where('patient_id', '=', filter.patientId);
    }
    if (filter.practitionerId) {
      query = query.where('practitioner_id', '=', filter.practitionerId);
    }
    if (filter.locationId) {
      query = query.where('location_id', '=', filter.locationId);
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

  async listBySeriesId(trx: Executor, tenantId: string, seriesId: string): Promise<AppointmentRow[]> {
    const rows = await trx
      .selectFrom('appointments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('series_id', '=', seriesId)
      .orderBy('scheduled_start', 'asc')
      .execute();
    return rows.map(toRow);
  }

  /** Overlapping, currently-holding-the-slot appointments for the same practitioner. */
  async findOverlappingByPractitioner(
    trx: Executor,
    tenantId: string,
    input: { practitionerId: string; scheduledStart: Date; scheduledEnd: Date; excludeAppointmentId?: string },
  ): Promise<AppointmentRow[]> {
    let query = trx
      .selectFrom('appointments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', input.practitionerId)
      .where('status', 'in', BLOCKING_STATUSES)
      .where('scheduled_start', '<', input.scheduledEnd)
      .where('scheduled_end', '>', input.scheduledStart);
    if (input.excludeAppointmentId) {
      query = query.where('id', '!=', input.excludeAppointmentId);
    }
    const rows = await query.execute();
    return rows.map(toRow);
  }

  /** Overlapping, currently-holding-the-slot appointments booked against the same resource. */
  async findOverlappingByResource(
    trx: Executor,
    tenantId: string,
    input: { resourceId: string; scheduledStart: Date; scheduledEnd: Date; excludeAppointmentId?: string },
  ): Promise<AppointmentRow[]> {
    let query = trx
      .selectFrom('appointments')
      .innerJoin('appointment_resources', 'appointment_resources.appointment_id', 'appointments.id')
      .selectAll('appointments')
      .where('appointments.tenant_id', '=', tenantId)
      .where('appointment_resources.resource_id', '=', input.resourceId)
      .where('appointments.status', 'in', BLOCKING_STATUSES)
      .where('appointments.scheduled_start', '<', input.scheduledEnd)
      .where('appointments.scheduled_end', '>', input.scheduledStart);
    if (input.excludeAppointmentId) {
      query = query.where('appointments.id', '!=', input.excludeAppointmentId);
    }
    const rows = await query.execute();
    return rows.map(toRow);
  }

  async assignResources(trx: Executor, tenantId: string, appointmentId: string, resourceIds: string[]): Promise<void> {
    if (resourceIds.length === 0) return;
    await trx
      .insertInto('appointment_resources')
      .values(resourceIds.map((resourceId) => ({ tenant_id: tenantId, appointment_id: appointmentId, resource_id: resourceId })))
      .execute();
  }

  async listResourceIdsForAppointment(trx: Executor, tenantId: string, appointmentId: string): Promise<string[]> {
    const rows = await trx
      .selectFrom('appointment_resources')
      .select('resource_id')
      .where('tenant_id', '=', tenantId)
      .where('appointment_id', '=', appointmentId)
      .execute();
    return rows.map((r) => r.resource_id);
  }

  /** Patches the scheduled window without touching status — used for a reschedule, not a transition. */
  async reschedule(
    trx: Executor,
    tenantId: string,
    id: string,
    patch: { scheduledStart: Date; scheduledEnd: Date },
    updatedBy: string,
  ): Promise<AppointmentRow> {
    const row = await trx
      .updateTable('appointments')
      .set({
        scheduled_start: patch.scheduledStart,
        scheduled_end: patch.scheduledEnd,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
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
      waitlisted_at: Date;
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
    seriesId: dbRow.series_id,
    recurrenceRule: dbRow.recurrence_rule,
    waitlistedAt: dbRow.waitlisted_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
