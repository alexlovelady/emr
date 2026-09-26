import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '../encounter/encounter.repository.js';
import type { CreateProcedureInput } from './procedure.dto.js';
import { ProcedureRepository, type ProcedureRow } from './procedure.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class ProcedureService {
  constructor(
    private readonly repo: ProcedureRepository = new ProcedureRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, encounterId: string, input: CreateProcedureInput): Promise<ProcedureRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const actorId = ctx.actor?.id ?? null;
    const procedure = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId: encounter.patientId,
      encounterId,
      codeSystem: input.codeSystem ?? null,
      code: input.code ?? null,
      displayName: input.displayName,
      notes: input.notes ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'procedure.recorded.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'procedure',
          aggregate_id: procedure.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { displayName: procedure.displayName },
        }),
      )
      .execute();

    return procedure;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ProcedureRow> {
    const procedure = await this.repo.findById(trx, ctx.tenantId, id);
    if (!procedure) throw new NotFoundError('Procedure not found', { id });
    return procedure;
  }

  async list(trx: Executor, ctx: RequestContext, encounterId: string): Promise<ProcedureRow[]> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });
    return this.repo.listByEncounter(trx, ctx.tenantId, encounterId);
  }
}
