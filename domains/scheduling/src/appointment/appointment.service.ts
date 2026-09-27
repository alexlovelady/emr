import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { CreateAppointmentInput } from './appointment.dto.js';
import { AppointmentRepository, type AppointmentRow } from './appointment.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §11.1's golden-path state machine, scoped to the states that exist before an
 * Encounter does (Phase 3+): Scheduled → Confirmed → CheckedIn, plus the Cancelled/NoShow exits.
 * Every transition is explicit (rule #15) — an appointment not in one of `from` never transitions.
 */
const TRANSITIONS: Record<string, { from: string[] }> = {
  confirmed: { from: ['scheduled'] },
  checked_in: { from: ['scheduled', 'confirmed'] },
  cancelled: { from: ['scheduled', 'confirmed'] },
  no_show: { from: ['scheduled', 'confirmed'] },
};

export class AppointmentService {
  constructor(private readonly repo: AppointmentRepository = new AppointmentRepository()) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateAppointmentInput): Promise<AppointmentRow> {
    if (input.scheduledEnd <= input.scheduledStart) {
      throw new ConflictError('scheduledEnd must be after scheduledStart');
    }
    const actorId = ctx.actor?.id ?? null;
    const appointment = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: input.patientId,
      locationId: input.locationId,
      practitionerId: input.practitionerId,
      appointmentType: input.appointmentType,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, appointment, 'appointment.booked.v1', 1, {
      patientId: appointment.patientId,
      scheduledStart: appointment.scheduledStart.toISOString(),
    });

    return appointment;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const appointment = await this.repo.findById(trx, ctx.tenantId, id);
    if (!appointment) throw new NotFoundError('Appointment not found', { id });
    return appointment;
  }

  async list(
    trx: Executor,
    ctx: RequestContext,
    filter: { patientId?: string; scheduledFrom?: Date; scheduledTo?: Date } = {},
  ): Promise<AppointmentRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }

  async confirm(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'confirmed');
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(trx, ctx.tenantId, id, 'confirmed', { confirmed_at: new Date() }, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'appointment.confirmed.v1', updated.version, {});
    return updated;
  }

  async checkIn(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'checked_in');
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(
      trx,
      ctx.tenantId,
      id,
      'checked_in',
      { checked_in_at: new Date() },
      actorId ?? ctx.tenantId,
    );
    await this.emit(trx, ctx, updated, 'appointment.checked_in.v1', updated.version, {});
    return updated;
  }

  async cancel(trx: Executor, ctx: RequestContext, id: string, reason: string | null): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'cancelled');
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(
      trx,
      ctx.tenantId,
      id,
      'cancelled',
      { cancelled_at: new Date(), ...(reason ? { cancellation_reason: reason } : {}) },
      actorId ?? ctx.tenantId,
    );
    await this.emit(trx, ctx, updated, 'appointment.cancelled.v1', updated.version, { reason });
    return updated;
  }

  async markNoShow(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'no_show');
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(trx, ctx.tenantId, id, 'no_show', { no_show_at: new Date() }, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'appointment.no_show.v1', updated.version, {});
    return updated;
  }

  private assertTransition(currentStatus: string, targetStatus: string): void {
    const rule = TRANSITIONS[targetStatus];
    if (!rule || !rule.from.includes(currentStatus)) {
      throw new ConflictError(`Cannot transition appointment from '${currentStatus}' to '${targetStatus}'`, {
        currentStatus,
        targetStatus,
      });
    }
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    appointment: AppointmentRow,
    eventType: string,
    aggregateVersion: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'appointment',
          aggregate_id: appointment.id,
          aggregate_version: aggregateVersion,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
