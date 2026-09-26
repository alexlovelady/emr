import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import { MedicationService } from '@ehr/medication';
import { ProblemService } from '../problem/problem.service.js';
import { AllergyService } from '../allergy/allergy.service.js';
import type { ImportExternalCandidatesInput } from './external-candidate.dto.js';
import { ExternalCandidateRepository, type ExternalCandidateRow } from './external-candidate.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const RESOLVED_STATUSES = ['accepted', 'rejected', 'duplicate', 'replaced'];

/**
 * EHR_BUILD_SPEC.md §11.3's external record reconciliation workflow: accept / reject / mark
 * duplicate / replace, always reviewer-attributed, never auto-merged into the chart.
 */
export class ExternalCandidateService {
  constructor(
    private readonly repo: ExternalCandidateRepository = new ExternalCandidateRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly problemService: ProblemService = new ProblemService(),
    private readonly allergyService: AllergyService = new AllergyService(),
    private readonly medicationService: MedicationService = new MedicationService(),
  ) {}

  async import(trx: Executor, ctx: RequestContext, patientId: string, input: ImportExternalCandidatesInput): Promise<ExternalCandidateRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const actorId = ctx.actor?.id ?? null;
    const created: ExternalCandidateRow[] = [];
    for (const item of input.items) {
      const candidate = await this.repo.create(trx, {
        tenantId: ctx.tenantId,
        patientId,
        originType: input.originType,
        sourceDocumentId: input.sourceDocumentId,
        resourceType: item.resourceType,
        payload: item.payload,
        createdBy: actorId ?? ctx.tenantId,
      });
      await this.emit(trx, ctx, candidate, 'external_candidate.imported.v1', { resourceType: candidate.resourceType });
      created.push(candidate);
    }
    return created;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ExternalCandidateRow> {
    const candidate = await this.repo.findById(trx, ctx.tenantId, id);
    if (!candidate) throw new NotFoundError('External candidate not found', { id });
    return candidate;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<ExternalCandidateRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async accept(trx: Executor, ctx: RequestContext, id: string): Promise<ExternalCandidateRow> {
    const candidate = await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    const createdResourceId = await this.createResourceFromCandidate(trx, ctx, candidate);
    const resolved = await this.repo.resolve(trx, ctx.tenantId, id, 'accepted', actorId ?? ctx.tenantId, {
      created_resource_id: createdResourceId,
    });
    await this.emit(trx, ctx, resolved, 'external_candidate.accepted.v1', { createdResourceId });
    return resolved;
  }

  async reject(trx: Executor, ctx: RequestContext, id: string): Promise<ExternalCandidateRow> {
    await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    const resolved = await this.repo.resolve(trx, ctx.tenantId, id, 'rejected', actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, resolved, 'external_candidate.rejected.v1', {});
    return resolved;
  }

  async markDuplicate(trx: Executor, ctx: RequestContext, id: string): Promise<ExternalCandidateRow> {
    await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    const resolved = await this.repo.resolve(trx, ctx.tenantId, id, 'duplicate', actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, resolved, 'external_candidate.marked_duplicate.v1', {});
    return resolved;
  }

  /** Accepts the candidate as a new row AND stamps the resource it corrects as superseded. */
  async replace(trx: Executor, ctx: RequestContext, id: string, targetResourceId: string): Promise<ExternalCandidateRow> {
    const candidate = await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    const createdResourceId = await this.createResourceFromCandidate(trx, ctx, candidate);
    await this.repo.markResourceSuperseded(trx, ctx.tenantId, candidate.resourceType, targetResourceId, id);
    const resolved = await this.repo.resolve(trx, ctx.tenantId, id, 'replaced', actorId ?? ctx.tenantId, {
      created_resource_id: createdResourceId,
      replaces_resource_id: targetResourceId,
    });
    await this.emit(trx, ctx, resolved, 'external_candidate.replaced.v1', { targetResourceId, createdResourceId });
    return resolved;
  }

  private async assertPending(trx: Executor, ctx: RequestContext, id: string): Promise<ExternalCandidateRow> {
    const candidate = await this.getById(trx, ctx, id);
    if (RESOLVED_STATUSES.includes(candidate.status)) {
      throw new ConflictError(`This external candidate has already been ${candidate.status}`, { id, status: candidate.status });
    }
    return candidate;
  }

  private async createResourceFromCandidate(trx: Executor, ctx: RequestContext, candidate: ExternalCandidateRow): Promise<string> {
    const payload = candidate.payload as Record<string, unknown>;
    if (candidate.resourceType === 'problem') {
      const problem = await this.problemService.create(trx, ctx, candidate.patientId, {
        codeSystem: payload.codeSystem as string,
        code: payload.code as string,
        displayName: payload.displayName as string,
        onsetDate: (payload.onsetDate as string | null | undefined) ?? null,
        notes: (payload.notes as string | null | undefined) ?? null,
      });
      return problem.id;
    }
    if (candidate.resourceType === 'allergy') {
      const allergy = await this.allergyService.create(trx, ctx, candidate.patientId, {
        substance: payload.substance as string,
        reaction: (payload.reaction as string | null | undefined) ?? null,
        severity: (payload.severity as 'mild' | 'moderate' | 'severe' | null | undefined) ?? null,
        onsetDate: (payload.onsetDate as string | null | undefined) ?? null,
        notes: (payload.notes as string | null | undefined) ?? null,
      });
      return allergy.id;
    }
    const medication = await this.medicationService.create(trx, ctx, candidate.patientId, {
      medicationName: payload.medicationName as string,
      rxnormCode: (payload.rxnormCode as string | null | undefined) ?? null,
      dose: (payload.dose as string | null | undefined) ?? null,
      route: (payload.route as string | null | undefined) ?? null,
      frequency: (payload.frequency as string | null | undefined) ?? null,
      sourceType: 'external_import',
      startedAt: (payload.startedAt as string | null | undefined) ?? null,
      notes: (payload.notes as string | null | undefined) ?? null,
    });
    return medication.id;
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    candidate: ExternalCandidateRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'external_candidate',
          aggregate_id: candidate.id,
          aggregate_version: candidate.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
