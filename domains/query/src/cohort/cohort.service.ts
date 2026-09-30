import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { compileAndRun, compileBreakdown, type CohortBreakdownResult } from './cohort-compiler.js';
import type { BreakdownDimension, CohortDsl, SaveCohortInput } from './cohort.dto.js';
import { CohortRepository, type CohortExecutionRow, type CohortRow } from './cohort.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

/**
 * EHR_BUILD_SPEC.md §8.2-8.3: `cohorts` are saved, named, reusable definitions; each run (saved or
 * ad-hoc — `cohortId: null` supports one-off DSL execution without saving it first) produces a
 * `cohort_executions` row via `compileAndRun()`'s 7-step pipeline (cohort-compiler.ts). Export is a
 * separate, audited step — execution itself only ever returns/stores a patient-id list, never a
 * demographics dump.
 */
export class CohortService {
  constructor(
    private readonly objectStorageGateway: ObjectStorageGateway,
    private readonly repo: CohortRepository = new CohortRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, input: SaveCohortInput): Promise<CohortRow> {
    const actorId = ctx.actor?.id ?? null;
    const cohort = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? null,
      dslPayload: input.dsl,
      createdBy: actorId ?? ctx.tenantId,
    });
    await this.emitCohort(trx, ctx, cohort, 'cohort.created.v1', { name: cohort.name });
    return cohort;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<CohortRow> {
    const cohort = await this.repo.findById(trx, ctx.tenantId, id);
    if (!cohort) throw new NotFoundError('Cohort not found', { id });
    return cohort;
  }

  async list(trx: Executor, ctx: RequestContext): Promise<CohortRow[]> {
    return this.repo.list(trx, ctx.tenantId);
  }

  async execute(trx: Executor, ctx: RequestContext, cohortId: string | null, dsl: CohortDsl): Promise<CohortExecutionRow> {
    if (cohortId) {
      await this.getById(trx, ctx, cohortId); // 404s if the saved cohort doesn't exist / isn't this tenant's
    }

    const result = await compileAndRun(trx, ctx.tenantId, dsl);
    const actorId = ctx.actor?.id ?? null;
    const execution = await this.repo.createExecution(trx, {
      tenantId: ctx.tenantId,
      cohortId,
      dslPayload: dsl,
      estimatedRows: result.estimatedRows,
      resultPatientIds: result.patientIds,
      resultCount: result.resultCount,
      createdBy: actorId ?? ctx.tenantId,
    });

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'cohort.executed.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'cohort_execution',
          aggregate_id: execution.id,
          aggregate_version: execution.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { cohortId, resultCount: execution.resultCount, estimatedRows: execution.estimatedRows, truncated: result.truncated },
        }),
      )
      .execute();

    return execution;
  }

  /** Live, unpersisted count preview for a filter set still being edited — no `cohort_executions`
   * row, no outbox event, just the same compiler's count. Never returns the patient-id list. */
  async preview(trx: Executor, ctx: RequestContext, dsl: CohortDsl): Promise<{ resultCount: number; estimatedRows: number | null; truncated: boolean }> {
    const result = await compileAndRun(trx, ctx.tenantId, dsl);
    return { resultCount: result.resultCount, estimatedRows: result.estimatedRows, truncated: result.truncated };
  }

  /** Item 1's "slice" capability — aggregate-only breakdown of the same matched population. */
  async breakdown(trx: Executor, ctx: RequestContext, dsl: CohortDsl, groupBy: BreakdownDimension): Promise<CohortBreakdownResult> {
    return compileBreakdown(trx, ctx.tenantId, dsl, groupBy);
  }

  async getExecutionById(trx: Executor, ctx: RequestContext, id: string): Promise<CohortExecutionRow> {
    const execution = await this.repo.findExecutionById(trx, ctx.tenantId, id);
    if (!execution) throw new NotFoundError('Cohort execution not found', { id });
    return execution;
  }

  async listExecutions(trx: Executor, ctx: RequestContext, cohortId: string): Promise<CohortExecutionRow[]> {
    await this.getById(trx, ctx, cohortId);
    return this.repo.listExecutionsByCohort(trx, ctx.tenantId, cohortId);
  }

  /** Renders the execution's patient-id list to CSV and stores it via the object storage gateway. */
  async exportExecution(trx: Executor, ctx: RequestContext, executionId: string): Promise<{ downloadUrl: string }> {
    const execution = await this.getExecutionById(trx, ctx, executionId);
    if (execution.resultCount === 0) {
      throw new ConflictError('Cannot export an execution with no results', { id: executionId });
    }

    const csv = ['patient_id', ...execution.resultPatientIds].join('\n');
    const { storageKey } = await this.objectStorageGateway.putObject({
      tenantId: ctx.tenantId,
      filename: `cohort-export-${execution.id}.csv`,
      contentType: 'text/csv',
      body: csv,
    });

    const actorId = ctx.actor?.id ?? null;
    await this.repo.setExportStorageKey(trx, ctx.tenantId, executionId, storageKey, actorId ?? ctx.tenantId);

    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: 'cohort.exported.v1',
          tenant_id: ctx.tenantId,
          aggregate_type: 'cohort_execution',
          aggregate_id: execution.id,
          aggregate_version: execution.version,
          actor_id: actorId,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data: { storageKey, resultCount: execution.resultCount },
        }),
      )
      .execute();

    const downloadUrl = await this.objectStorageGateway.getDownloadUrl({ storageKey });
    return { downloadUrl };
  }

  private async emitCohort(trx: Executor, ctx: RequestContext, cohort: CohortRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'cohort',
          aggregate_id: cohort.id,
          aggregate_version: cohort.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
