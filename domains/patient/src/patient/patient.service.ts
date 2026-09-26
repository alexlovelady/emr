import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientIdentifierRepository } from '../identifier/identifier.repository.js';
import type { CreatePatientInput, FindDuplicatesQuery, MergePatientsInput } from './patient.dto.js';
import { PatientMergeHistoryRepository, type PatientMergeHistoryRow } from './merge-history.repository.js';
import { PatientRepository, type DuplicateCandidate, type PatientRow } from './patient.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class PatientService {
  constructor(
    private readonly repo: PatientRepository = new PatientRepository(),
    private readonly identifierRepo: PatientIdentifierRepository = new PatientIdentifierRepository(),
    private readonly mergeHistoryRepo: PatientMergeHistoryRepository = new PatientMergeHistoryRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: CreatePatientInput): Promise<PatientRow> {
    const actorId = ctx.actor?.id ?? null;
    const patient = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      givenName: input.givenName,
      familyName: input.familyName,
      middleName: input.middleName ?? null,
      dateOfBirth: input.dateOfBirth,
      sexAtBirth: input.sexAtBirth ?? null,
      genderIdentity: input.genderIdentity ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      country: input.country ?? null,
      preferredLanguage: input.preferredLanguage ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'patient.registered.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: patient.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { givenName: patient.givenName, familyName: patient.familyName },
        }),
      )
      .execute();

    return patient;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<PatientRow> {
    const patient = await this.repo.findById(trx, ctx.tenantId, id);
    if (!patient) throw new NotFoundError('Patient not found', { id });
    return patient;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<PatientRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }

  /**
   * Deterministic scoring only — spec §5.3: "no automatic patient merge without configurable
   * high-confidence rules and review." This never merges anything; it only surfaces candidates
   * for a human to review via the separate `merge()` call.
   */
  async findDuplicates(
    trx: Executor,
    ctx: RequestContext,
    query: FindDuplicatesQuery,
    excludePatientId?: string,
  ): Promise<DuplicateCandidate[]> {
    return this.repo.findDuplicateCandidates(trx, ctx.tenantId, query, excludePatientId);
  }

  /**
   * Merges `input.sourcePatientId` into `targetPatientId`: moves the source's identifiers to the
   * target, marks the source `status: 'merged'`, and records a `patient_merge_history` row so the
   * merge can be reversed later (spec §5.3's "reversible merge metadata"). Never called
   * automatically — always an explicit human action via this API.
   */
  async merge(trx: Executor, ctx: RequestContext, targetPatientId: string, input: MergePatientsInput): Promise<PatientMergeHistoryRow> {
    if (targetPatientId === input.sourcePatientId) {
      throw new ConflictError('Cannot merge a patient into itself', { targetPatientId });
    }
    const target = await this.getById(trx, ctx, targetPatientId);
    const source = await this.getById(trx, ctx, input.sourcePatientId);
    if (source.status === 'merged') {
      throw new ConflictError('Source patient has already been merged', { sourcePatientId: source.id });
    }

    const actorId = ctx.actor?.id ?? null;
    const mergedBy = actorId ?? ctx.tenantId;

    const sourceIdentifiers = await this.identifierRepo.listByPatient(trx, ctx.tenantId, source.id);
    const movedIdentifierIds: string[] = [];
    for (const identifier of sourceIdentifiers) {
      await this.identifierRepo.reassignToPatient(trx, ctx.tenantId, identifier.id, target.id, mergedBy);
      movedIdentifierIds.push(identifier.id);
    }

    await this.repo.setStatus(trx, ctx.tenantId, source.id, 'merged', { mergedInto: target.id }, mergedBy);

    const history = await this.mergeHistoryRepo.create(trx, {
      tenantId: ctx.tenantId,
      sourcePatientId: source.id,
      targetPatientId: target.id,
      mergedBy,
      mergeReason: input.reason ?? null,
    });
    await trx
      .updateTable('patient_merge_history')
      .set({ metadata: JSON.stringify({ movedIdentifierIds }) })
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', history.id)
      .execute();

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'patient.merged.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: target.id,
          aggregate_version: target.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { sourcePatientId: source.id, mergeId: history.id },
        }),
      )
      .execute();

    return history;
  }

  async reverseMerge(trx: Executor, ctx: RequestContext, mergeId: string): Promise<PatientMergeHistoryRow> {
    const history = await this.mergeHistoryRepo.findById(trx, ctx.tenantId, mergeId);
    if (!history) throw new NotFoundError('Patient merge record not found', { mergeId });
    if (history.reversedAt) {
      throw new ConflictError('This merge has already been reversed', { mergeId });
    }

    const actorId = ctx.actor?.id ?? null;
    const reversedBy = actorId ?? ctx.tenantId;

    const movedRow = await trx
      .selectFrom('patient_merge_history')
      .select('metadata')
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', mergeId)
      .executeTakeFirstOrThrow();
    const movedIdentifierIds = (movedRow.metadata as { movedIdentifierIds?: string[] }).movedIdentifierIds ?? [];

    for (const identifierId of movedIdentifierIds) {
      await this.identifierRepo.reassignToPatient(trx, ctx.tenantId, identifierId, history.sourcePatientId, reversedBy);
    }

    await this.repo.setStatus(trx, ctx.tenantId, history.sourcePatientId, 'active', { mergedInto: null }, reversedBy);
    const reversed = await this.mergeHistoryRepo.markReversed(trx, ctx.tenantId, mergeId, reversedBy);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'patient.merge_reversed.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'patient',
          aggregate_id: history.sourcePatientId,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { mergeId },
        }),
      )
      .execute();

    return reversed;
  }
}
