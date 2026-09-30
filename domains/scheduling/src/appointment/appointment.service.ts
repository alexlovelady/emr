import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { VideoVisitGateway } from '@ehr/video-adapter';
import { NoopVideoVisitGateway } from '@ehr/video-adapter';
import { ResourceRepository } from '../resource/resource.repository.js';
import type { CreateAppointmentInput, CreateAppointmentSeriesInput, RecurrenceInput, RescheduleAppointmentInput } from './appointment.dto.js';
import { AppointmentRepository, type AppointmentRow } from './appointment.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §11.1's golden-path state machine, scoped to the states that exist before an
 * Encounter does (Phase 3+): Scheduled → Confirmed → CheckedIn, plus the Cancelled/NoShow exits,
 * plus (Phase I) Waitlisted as a holding state reachable from Scheduled/Cancelled, promotable back
 * to Scheduled once a slot is confirmed free. Every transition is explicit (rule #15) — an
 * appointment not in one of `from` never transitions.
 */
const TRANSITIONS: Record<string, { from: string[] }> = {
  confirmed: { from: ['scheduled'] },
  checked_in: { from: ['scheduled', 'confirmed'] },
  cancelled: { from: ['scheduled', 'confirmed'] },
  no_show: { from: ['scheduled', 'confirmed'] },
  waitlisted: { from: ['scheduled', 'cancelled'] },
  scheduled: { from: ['waitlisted'] },
};

export class AppointmentService {
  constructor(
    private readonly repo: AppointmentRepository = new AppointmentRepository(),
    private readonly resourceRepo: ResourceRepository = new ResourceRepository(),
    private readonly videoGateway: VideoVisitGateway = new NoopVideoVisitGateway(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateAppointmentInput): Promise<AppointmentRow> {
    return this.createOne(trx, ctx, input);
  }

  /**
   * Expands a recurrence rule into N appointments sharing one `seriesId`, each independently
   * conflict-checked exactly like a single booking — a conflict on any occurrence fails the whole
   * series (the caller's transaction rolls back, so no partial series is ever left behind).
   */
  async createSeries(trx: Executor, ctx: RequestContext, input: CreateAppointmentSeriesInput): Promise<AppointmentRow[]> {
    const seriesId = randomUUID();
    const occurrences = expandRecurrence(input.scheduledStart, input.scheduledEnd, input.recurrence);
    const created: AppointmentRow[] = [];
    for (const occurrence of occurrences) {
      const appointment = await this.createOne(
        trx,
        ctx,
        { ...input, scheduledStart: occurrence.start, scheduledEnd: occurrence.end },
        { seriesId, recurrenceRule: input.recurrence },
      );
      created.push(appointment);
    }
    return created;
  }

  /** Cancels every not-already-cancelled appointment in a series. */
  async cancelSeries(trx: Executor, ctx: RequestContext, seriesId: string, reason: string | null): Promise<AppointmentRow[]> {
    const appointments = await this.repo.listBySeriesId(trx, ctx.tenantId, seriesId);
    if (appointments.length === 0) throw new NotFoundError('Appointment series not found', { seriesId });

    const cancelled: AppointmentRow[] = [];
    for (const appointment of appointments) {
      if (appointment.status === 'cancelled') {
        cancelled.push(appointment);
        continue;
      }
      cancelled.push(await this.cancel(trx, ctx, appointment.id, reason));
    }
    return cancelled;
  }

  private async createOne(
    trx: Executor,
    ctx: RequestContext,
    input: CreateAppointmentInput,
    series?: { seriesId: string; recurrenceRule: RecurrenceInput },
  ): Promise<AppointmentRow> {
    if (input.scheduledEnd <= input.scheduledStart) {
      throw new ConflictError('scheduledEnd must be after scheduledStart');
    }

    const resourceIds = input.resourceIds ?? [];
    if (!input.override) {
      await this.assertNoConflicts(trx, ctx.tenantId, {
        practitionerId: input.practitionerId,
        resourceIds,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
      });
    }
    if (resourceIds.length > 0) {
      const resources = await this.resourceRepo.findByIds(trx, ctx.tenantId, resourceIds);
      if (resources.length !== resourceIds.length) {
        const foundIds = new Set(resources.map((r) => r.id));
        const missing = resourceIds.filter((id) => !foundIds.has(id));
        throw new NotFoundError('One or more resources not found', { resourceIds: missing });
      }
    }

    const actorId = ctx.actor?.id ?? null;
    let appointment = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: input.patientId,
      locationId: input.locationId,
      practitionerId: input.practitionerId,
      appointmentType: input.appointmentType,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      createdBy: actorId ?? ctx.tenantId,
      visitType: input.visitType,
      ...(series ? { seriesId: series.seriesId, recurrenceRule: series.recurrenceRule } : {}),
    });

    if (resourceIds.length > 0) {
      await this.repo.assignResources(trx, ctx.tenantId, appointment.id, resourceIds);
    }

    if (appointment.visitType === 'telehealth') {
      const videoVisit = await this.videoGateway.createVisit({ appointmentId: appointment.id });
      appointment = await this.repo.attachVideoVisit(trx, ctx.tenantId, appointment.id, videoVisit);
    }

    await this.emit(trx, ctx, appointment, 'appointment.booked.v1', 1, {
      patientId: appointment.patientId,
      scheduledStart: appointment.scheduledStart.toISOString(),
    });

    return appointment;
  }

  private async assertNoConflicts(
    trx: Executor,
    tenantId: string,
    input: { practitionerId: string; resourceIds: string[]; scheduledStart: Date; scheduledEnd: Date; excludeAppointmentId?: string },
  ): Promise<void> {
    const practitionerConflicts = await this.repo.findOverlappingByPractitioner(trx, tenantId, input);
    if (practitionerConflicts.length > 0) {
      throw new ConflictError('Practitioner is already booked for this time', {
        practitionerId: input.practitionerId,
        conflictingAppointmentIds: practitionerConflicts.map((a) => a.id),
      });
    }
    for (const resourceId of input.resourceIds) {
      const resourceConflicts = await this.repo.findOverlappingByResource(trx, tenantId, { ...input, resourceId });
      if (resourceConflicts.length > 0) {
        throw new ConflictError('Resource is already booked for this time', {
          resourceId,
          conflictingAppointmentIds: resourceConflicts.map((a) => a.id),
        });
      }
    }
  }

  /**
   * Changes an appointment's time without touching its status — re-runs the same conflict check
   * used at create time (excluding this appointment itself from the overlap search) so a
   * reschedule can't silently create a double-booking. Used by `apps/interop-hl7`'s SIU^S14
   * handler; also a real, small, standalone capability (`POST /appointments/:id/reschedule`).
   */
  async reschedule(trx: Executor, ctx: RequestContext, id: string, patch: RescheduleAppointmentInput): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    if (!['scheduled', 'confirmed'].includes(current.status)) {
      throw new ConflictError(`Cannot reschedule an appointment with status '${current.status}'`, { status: current.status });
    }
    if (patch.scheduledEnd <= patch.scheduledStart) {
      throw new ConflictError('scheduledEnd must be after scheduledStart');
    }
    const resourceIds = await this.repo.listResourceIdsForAppointment(trx, ctx.tenantId, id);
    await this.assertNoConflicts(trx, ctx.tenantId, {
      practitionerId: current.practitionerId,
      resourceIds,
      scheduledStart: patch.scheduledStart,
      scheduledEnd: patch.scheduledEnd,
      excludeAppointmentId: current.id,
    });
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.reschedule(trx, ctx.tenantId, id, patch, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'appointment.rescheduled.v1', updated.version, {
      scheduledStart: updated.scheduledStart.toISOString(),
      scheduledEnd: updated.scheduledEnd.toISOString(),
    });
    return updated;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const appointment = await this.repo.findById(trx, ctx.tenantId, id);
    if (!appointment) throw new NotFoundError('Appointment not found', { id });
    return appointment;
  }

  async getResourceIds(trx: Executor, ctx: RequestContext, id: string): Promise<string[]> {
    await this.getById(trx, ctx, id);
    return this.repo.listResourceIdsForAppointment(trx, ctx.tenantId, id);
  }

  async list(
    trx: Executor,
    ctx: RequestContext,
    filter: { patientId?: string; practitionerId?: string; locationId?: string; scheduledFrom?: Date; scheduledTo?: Date } = {},
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

  /** Epic-parity item 3 — pre-visit agenda capture. Never blocked by `cancelled_at`/status the way
   * `assertTransition` guards real state changes, since this is a plain free-text field, not a
   * status transition — a patient can still leave a note on an appointment they're about to
   * confirm or check into. */
  async updatePatientAgenda(trx: Executor, ctx: RequestContext, id: string, agenda: string): Promise<AppointmentRow> {
    await this.getById(trx, ctx, id); // 404s if this tenant has no such appointment
    const updated = await this.repo.updatePatientAgenda(trx, ctx.tenantId, id, agenda);
    await this.emit(trx, ctx, updated, 'appointment.patient_agenda_updated.v1', updated.version, {});
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

  /** Moves a scheduled/cancelled appointment onto the waitlist — e.g. a patient wants a slot
   * that's currently full, or a cancelled slot might reopen and the patient wants to be recalled. */
  async waitlist(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'waitlisted');
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(trx, ctx.tenantId, id, 'waitlisted', { waitlisted_at: new Date() }, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'appointment.waitlisted.v1', updated.version, {});
    return updated;
  }

  /** Manually promotes a waitlisted appointment back to scheduled — re-runs the same conflict
   * check first, since the slot it wants might still be held by something else. */
  async promote(trx: Executor, ctx: RequestContext, id: string): Promise<AppointmentRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, 'scheduled');
    const resourceIds = await this.repo.listResourceIdsForAppointment(trx, ctx.tenantId, id);
    await this.assertNoConflicts(trx, ctx.tenantId, {
      practitionerId: current.practitionerId,
      resourceIds,
      scheduledStart: current.scheduledStart,
      scheduledEnd: current.scheduledEnd,
      excludeAppointmentId: current.id,
    });
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(trx, ctx.tenantId, id, 'scheduled', {}, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'appointment.promoted.v1', updated.version, {});
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

/** Simple {frequency, count, until} expansion — not full iCal RRULE (see plan file history). */
function expandRecurrence(firstStart: Date, firstEnd: Date, recurrence: RecurrenceInput): Array<{ start: Date; end: Date }> {
  const stepMs = (recurrence.frequency === 'daily' ? 1 : 7) * 24 * 60 * 60 * 1000;
  const durationMs = firstEnd.getTime() - firstStart.getTime();
  const occurrences: Array<{ start: Date; end: Date }> = [];
  for (let i = 0; i < recurrence.count; i++) {
    const start = new Date(firstStart.getTime() + i * stepMs);
    if (recurrence.until && start > recurrence.until) break;
    occurrences.push({ start, end: new Date(start.getTime() + durationMs) });
  }
  return occurrences;
}
