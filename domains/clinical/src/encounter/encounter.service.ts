import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { AppointmentService } from '@ehr/scheduling';
import type { CreateEncounterInput } from './encounter.dto.js';
import { EncounterRepository, type EncounterRow } from './encounter.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §11.1's golden-path state machine, encounter side: Roomed (set at creation,
 * since an encounter always originates from a just-checked-in appointment — spec's
 * `Patient -> Appointment -> Encounter` arrow) -> InProgress -> Documentation -> Signed ->
 * CodingReview. States after CodingReview (ClaimReady, Submitted, ...) belong to Phase 6 (RCM).
 */
const TRANSITIONS: Record<string, { from: string[] }> = {
  in_progress: { from: ['roomed'] },
  documentation: { from: ['in_progress'] },
  signed: { from: ['documentation'] },
  coding_review: { from: ['signed'] },
};

export class EncounterService {
  constructor(
    private readonly repo: EncounterRepository = new EncounterRepository(),
    private readonly appointmentService: AppointmentService = new AppointmentService(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreateEncounterInput): Promise<EncounterRow> {
    const appointment = await this.appointmentService.getById(trx, ctx, input.appointmentId);
    if (appointment.status !== 'checked_in') {
      throw new ConflictError('Encounter can only be created from a checked-in appointment', {
        appointmentId: appointment.id,
        appointmentStatus: appointment.status,
      });
    }

    const actorId = ctx.actor?.id ?? null;
    const encounter = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      locationId: appointment.locationId,
      practitionerId: appointment.practitionerId,
      encounterType: input.encounterType,
      chiefComplaint: input.chiefComplaint ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, encounter, 'encounter.created.v1', 1, { patientId: encounter.patientId });

    return encounter;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<EncounterRow> {
    const encounter = await this.repo.findById(trx, ctx.tenantId, id);
    if (!encounter) throw new NotFoundError('Encounter not found', { id });
    return encounter;
  }

  async list(trx: Executor, ctx: RequestContext, filter: { patientId?: string } = {}): Promise<EncounterRow[]> {
    return this.repo.list(trx, ctx.tenantId, filter);
  }

  async start(trx: Executor, ctx: RequestContext, id: string): Promise<EncounterRow> {
    return this.transition(trx, ctx, id, 'in_progress', {}, 'encounter.started.v1');
  }

  async document(trx: Executor, ctx: RequestContext, id: string): Promise<EncounterRow> {
    return this.transition(trx, ctx, id, 'documentation', {}, 'encounter.documentation.v1');
  }

  async sign(trx: Executor, ctx: RequestContext, id: string): Promise<EncounterRow> {
    return this.transition(trx, ctx, id, 'signed', { ended_at: new Date() }, 'encounter.signed.v1');
  }

  async sendToCoding(trx: Executor, ctx: RequestContext, id: string): Promise<EncounterRow> {
    return this.transition(trx, ctx, id, 'coding_review', {}, 'encounter.coding_review.v1');
  }

  private async transition(
    trx: Executor,
    ctx: RequestContext,
    id: string,
    targetStatus: string,
    patch: Partial<{ ended_at: Date }>,
    eventType: string,
  ): Promise<EncounterRow> {
    const current = await this.getById(trx, ctx, id);
    const rule = TRANSITIONS[targetStatus];
    if (!rule || !rule.from.includes(current.status)) {
      throw new ConflictError(`Cannot transition encounter from '${current.status}' to '${targetStatus}'`, {
        currentStatus: current.status,
        targetStatus,
      });
    }
    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.transition(trx, ctx.tenantId, id, targetStatus, patch, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, eventType, updated.version, {});
    return updated;
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    encounter: EncounterRow,
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
          aggregate_type: 'encounter',
          aggregate_id: encounter.id,
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
