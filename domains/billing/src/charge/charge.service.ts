import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '@ehr/clinical';
import type { CreateChargeInput, FinalizeChargeCodingInput } from './charge.dto.js';
import { ChargeRepository, type ChargeRow } from './charge.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §13.1's charge capture + coding queue (Phase 6). `status`: draft (just
 * captured) -> coded (coder finalized) -> billed (included in a submitted claim, set by
 * `@ehr/claims`' ClaimService, not here) -> void. The coding queue (`GET /coding-queue`) is the
 * same shape as Phase 4's Results Inbox (`review_status: 'pending'` listing).
 */
export class ChargeService {
  constructor(
    private readonly repo: ChargeRepository = new ChargeRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateChargeInput): Promise<ChargeRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });
    if (encounter.patientId !== patientId) {
      throw new ConflictError('The encounter does not belong to this patient', { patientId, encounterId: input.encounterId });
    }

    const actorId = ctx.actor?.id ?? null;
    const charge = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId,
      billingPractitionerId: input.billingPractitionerId,
      codeSystem: input.codeSystem,
      code: input.code,
      description: input.description,
      units: input.units,
      unitPrice: String(input.unitPrice),
      diagnosisCodes: input.diagnosisCodes,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.emit(trx, ctx, charge, 'charge.captured.v1', { code: charge.code, unitPrice: charge.unitPrice });
    return charge;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ChargeRow> {
    const charge = await this.repo.findById(trx, ctx.tenantId, id);
    if (!charge) throw new NotFoundError('Charge not found', { id });
    return charge;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<ChargeRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async codingQueue(trx: Executor, ctx: RequestContext): Promise<ChargeRow[]> {
    return this.repo.listCodingQueue(trx, ctx.tenantId);
  }

  async finalizeCoding(trx: Executor, ctx: RequestContext, id: string, input: FinalizeChargeCodingInput): Promise<ChargeRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'draft') {
      throw new ConflictError(`Charge is already ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const coded = await this.repo.finalizeCoding(
      trx,
      ctx.tenantId,
      id,
      {
        codeSystem: input.codeSystem ?? current.codeSystem,
        code: input.code ?? current.code,
        description: input.description ?? current.description,
        diagnosisCodes: input.diagnosisCodes ?? current.diagnosisCodes,
      },
      actorId ?? ctx.tenantId,
    );
    await this.emit(trx, ctx, coded, 'charge.coded.v1', { code: coded.code });
    return coded;
  }

  private async emit(trx: Executor, ctx: RequestContext, charge: ChargeRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'charge',
          aggregate_id: charge.id,
          aggregate_version: charge.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
