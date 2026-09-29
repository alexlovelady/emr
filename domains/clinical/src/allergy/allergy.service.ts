import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import type { CreateAllergyInput, UpdateAllergyInput } from './allergy.dto.js';
import { AllergyRepository, type AllergyRow } from './allergy.repository.js';

const RESOLVABLE_STATUSES = ['active'];

type Executor = Kysely<DB> | Transaction<DB>;

export class AllergyService {
  constructor(
    private readonly repo: AllergyRepository = new AllergyRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateAllergyInput): Promise<AllergyRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;
    const allergy = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId ?? null,
      substance: input.substance,
      codeSystem: input.codeSystem ?? null,
      code: input.code ?? null,
      reaction: input.reaction ?? null,
      severity: input.severity ?? null,
      onsetDate: input.onsetDate ?? null,
      notes: input.notes ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'allergy.recorded.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'allergy',
          aggregate_id: allergy.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { substance: allergy.substance },
        }),
      )
      .execute();

    return allergy;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<AllergyRow> {
    const allergy = await this.repo.findById(trx, ctx.tenantId, id);
    if (!allergy) throw new NotFoundError('Allergy not found', { id });
    return allergy;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<AllergyRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async update(trx: Executor, ctx: RequestContext, id: string, input: UpdateAllergyInput): Promise<AllergyRow> {
    await this.getById(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    return this.repo.update(trx, ctx.tenantId, id, { ...input, updatedBy: actorId ?? ctx.tenantId });
  }

  async resolve(trx: Executor, ctx: RequestContext, id: string): Promise<AllergyRow> {
    const allergy = await this.getById(trx, ctx, id);
    if (!RESOLVABLE_STATUSES.includes(allergy.status)) {
      throw new ConflictError(`Allergy is already ${allergy.status}`, { id, status: allergy.status });
    }
    const actorId = ctx.actor?.id ?? null;
    const resolved = await this.repo.setStatus(trx, ctx.tenantId, id, 'resolved', actorId ?? ctx.tenantId);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'allergy.resolved.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'allergy',
          aggregate_id: resolved.id,
          aggregate_version: resolved.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { substance: resolved.substance },
        }),
      )
      .execute();

    return resolved;
  }
}
