import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { PatientRepository } from '@ehr/patient';
import { TerminologyService, type CodeValidation } from '@ehr/terminology';
import type { CreateProblemInput } from './problem.dto.js';
import { ProblemRepository, type ProblemRow } from './problem.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export class ProblemService {
  constructor(
    private readonly repo: ProblemRepository = new ProblemRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly terminology: TerminologyService = new TerminologyService(),
  ) {}

  /**
   * Phase M: `codeValidation` is advisory, per the plan's "warn, don't hard-block" — an
   * unrecognized code never blocks recording the problem, and `codeValidation.checked` lets a
   * caller tell "this code doesn't exist" apart from "ICD-10 hasn't been loaded at all" (see
   * `@ehr/terminology`'s own doc comment).
   */
  async create(
    trx: Executor,
    ctx: RequestContext,
    patientId: string,
    input: CreateProblemInput,
  ): Promise<{ problem: ProblemRow; codeValidation: CodeValidation }> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const codeValidation = await this.terminology.validateCode(trx, input.codeSystem, input.code);

    const actorId = ctx.actor?.id ?? null;
    const problem = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId ?? null,
      codeSystem: input.codeSystem,
      code: input.code,
      displayName: input.displayName,
      onsetDate: input.onsetDate ?? null,
      notes: input.notes ?? null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'problem.recorded.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'problem',
          aggregate_id: problem.id,
          aggregate_version: 1,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { displayName: problem.displayName },
        }),
      )
      .execute();

    return { problem, codeValidation };
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ProblemRow> {
    const problem = await this.repo.findById(trx, ctx.tenantId, id);
    if (!problem) throw new NotFoundError('Problem not found', { id });
    return problem;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<ProblemRow[]> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async updateStatus(trx: Executor, ctx: RequestContext, id: string, clinicalStatus: string): Promise<ProblemRow> {
    await this.getById(trx, ctx, id);
    const actorId = ctx.actor?.id ?? null;
    return this.repo.setClinicalStatus(trx, ctx.tenantId, id, clinicalStatus, actorId ?? ctx.tenantId);
  }
}
