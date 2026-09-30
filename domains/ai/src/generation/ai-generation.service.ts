import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, RateLimitExceededError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { AiGateway } from '@ehr/ai-adapter';
import type { ProposeAiGenerationInput } from './ai-generation.dto.js';
import { AiGenerationRepository, type AiGenerationRow } from './ai-generation.repository.js';
import { AiRateLimitRepository } from './ai-rate-limit.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const RESOLVED_STATUSES = ['accepted', 'accepted_with_edits', 'rejected'];

/**
 * The shared propose->review core behind all 8 Phase 9 AI features (EHR_BUILD_SPEC.md §15),
 * adapted directly from `domains/clinical`'s `ExternalCandidateService` (Phase 4) — same
 * pending/resolved shape, same `assertPending()` double-resolution guard, one outbox event per
 * transition. The one deliberate difference: `accept()` here NEVER creates or mutates any other
 * domain's data (contrast `ExternalCandidateService.accept()`, which does) — it only records the
 * reviewer's decision and (optionally) edited text. A human takes the accepted output and uses the
 * existing, already-audited domain-write endpoint themselves. This is the most literal reading of
 * §15.3's "never auto-applying" / "silent chart mutation" / "unsourced clinical facts" — this
 * service has read-only access to every other domain's repositories and never acquires write
 * access to any of them (NL-to-cohort-DSL's `execute-cohort` route is the one deliberate
 * exception — see nl-to-cohort-dsl.controller.ts).
 */
export class AiGenerationService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly repo: AiGenerationRepository = new AiGenerationRepository(),
    private readonly rateLimitRepo: AiRateLimitRepository = new AiRateLimitRepository(),
    private readonly dailyLimitPerTenant = 200,
  ) {}

  async propose(trx: Executor, ctx: RequestContext, input: ProposeAiGenerationInput): Promise<AiGenerationRow> {
    if (input.context.length === 0) {
      throw new ValidationError('AI generation requires at least one grounding context item', { feature: input.feature });
    }

    const actorIdForCounter = ctx.actor?.id ?? ctx.tenantId;
    const todayUtc = new Date().toISOString().slice(0, 10);
    const countToday = await this.rateLimitRepo.incrementAndGet(trx, ctx.tenantId, todayUtc, actorIdForCounter);
    if (countToday > this.dailyLimitPerTenant) {
      throw new RateLimitExceededError(`Tenant has reached its daily AI generation limit (${this.dailyLimitPerTenant})`, {
        limit: this.dailyLimitPerTenant,
        windowDate: todayUtc,
      });
    }

    const result = await this.gateway.generate({
      tenantId: ctx.tenantId,
      promptTemplateId: input.promptTemplateId,
      context: input.context,
      input: input.inputText,
    });

    const actorId = ctx.actor?.id ?? null;
    const row = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      feature: input.feature,
      patientId: input.patientId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      inputText: input.inputText,
      contextRefs: input.context.map((item) => item.ref),
      modelProvider: result.modelProvider,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      promptTemplateVersion: result.promptTemplateVersion,
      outputText: result.outputText,
      outputJson: result.outputJson,
      outputHash: result.outputHash,
      generatedAt: result.generatedAt,
      createdBy: actorId ?? ctx.tenantId,
      ...(input.linkedDiagnosticReportId ? { linkedDiagnosticReportId: input.linkedDiagnosticReportId } : {}),
    });

    await this.emit(trx, ctx, row, 'ai_generation.proposed.v1', { feature: row.feature });
    return row;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<AiGenerationRow> {
    const row = await this.repo.findById(trx, ctx.tenantId, id);
    if (!row) throw new NotFoundError('AI generation not found', { id });
    return row;
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<AiGenerationRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async accept(trx: Executor, ctx: RequestContext, id: string, editedOutputText: string | null): Promise<AiGenerationRow> {
    await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const status = editedOutputText ? 'accepted_with_edits' : 'accepted';
    const row = await this.repo.resolve(trx, ctx.tenantId, id, status, actorId, editedOutputText);
    await this.emit(trx, ctx, row, 'ai_generation.accepted.v1', { editedOutputText: editedOutputText !== null });
    return row;
  }

  async reject(trx: Executor, ctx: RequestContext, id: string): Promise<AiGenerationRow> {
    await this.assertPending(trx, ctx, id);
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const row = await this.repo.resolve(trx, ctx.tenantId, id, 'rejected', actorId, null);
    await this.emit(trx, ctx, row, 'ai_generation.rejected.v1', {});
    return row;
  }

  /** Exposed for `nl-to-cohort-dsl`'s execute-cohort route, which must check pending state before it validates/runs a candidate DSL. */
  async getPendingById(trx: Executor, ctx: RequestContext, id: string): Promise<AiGenerationRow> {
    return this.assertPending(trx, ctx, id);
  }

  /** `nl-to-cohort-dsl`'s one deliberate exception to "accept never mutates another domain" — see this file's class doc comment. */
  async acceptWithLinkedCohortExecution(
    trx: Executor,
    ctx: RequestContext,
    id: string,
    cohortExecutionId: string,
    editedOutputText: string | null,
  ): Promise<AiGenerationRow> {
    await this.repo.setLinkedCohortExecution(trx, ctx.tenantId, id, cohortExecutionId);
    return this.accept(trx, ctx, id, editedOutputText);
  }

  private async assertPending(trx: Executor, ctx: RequestContext, id: string): Promise<AiGenerationRow> {
    const row = await this.getById(trx, ctx, id);
    if (RESOLVED_STATUSES.includes(row.status)) {
      throw new ConflictError(`This AI generation has already been ${row.status}`, { id, status: row.status });
    }
    return row;
  }

  private async emit(trx: Executor, ctx: RequestContext, row: AiGenerationRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'ai_generation',
          aggregate_id: row.id,
          aggregate_version: row.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
