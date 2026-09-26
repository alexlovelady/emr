import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '../encounter/encounter.repository.js';
import type { CreateObservationInput } from './observation.dto.js';
import { ObservationRepository, type ObservationRow } from './observation.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class ObservationService {
  constructor(
    private readonly repo: ObservationRepository = new ObservationRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
  ) {}

  /**
   * `links` is for cross-domain callers only (`@ehr/results`, correlating a lab value back to
   * the order/specimen that produced it) — the public `CreateObservationSchema` DTO deliberately
   * has no `orderId`/`specimenId` fields, since a staff member recording vitals by hand has
   * neither.
   */
  async create(
    trx: Executor,
    ctx: RequestContext,
    encounterId: string,
    input: CreateObservationInput,
    links: { orderId?: string; specimenId?: string } = {},
  ): Promise<ObservationRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const actorId = ctx.actor?.id ?? null;
    const observation = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: encounter.patientId,
      encounterId,
      category: input.category,
      code: input.code,
      displayName: input.displayName,
      valueQuantity: input.valueQuantity != null ? String(input.valueQuantity) : null,
      valueText: input.valueText ?? null,
      unit: input.unit ?? null,
      orderId: links.orderId ?? null,
      specimenId: links.specimenId ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'observation.recorded.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'observation',
          aggregate_id: observation.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { code: observation.code },
        }),
      )
      .execute();

    return observation;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ObservationRow> {
    const observation = await this.repo.findById(trx, ctx.tenantId, id);
    if (!observation) throw new NotFoundError('Observation not found', { id });
    return observation;
  }

  async list(trx: Executor, ctx: RequestContext, encounterId: string): Promise<ObservationRow[]> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });
    return this.repo.listByEncounter(trx, ctx.tenantId, encounterId);
  }
}
