import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository, ObservationService } from '@ehr/clinical';
import { OrderRepository } from '@ehr/orders';
import { TaskService } from '@ehr/tasks';
import type { CreateDiagnosticReportInput } from './diagnostic-report.dto.js';
import { DiagnosticReportRepository, type DiagnosticReportRow } from './diagnostic-report.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_REVIEW_STATUSES = ['acknowledged'];

/**
 * EHR_BUILD_SPEC.md §11.2's lab result workflow + §5.6's critical-result rule. Individual result
 * values are stored as `@ehr/clinical` `observations` rows (`category: 'laboratory'`) rather than
 * a parallel table — see Phase 3's `observations` table doc comment for why it was built generic.
 * A `criticalFlag: true` report automatically opens a durable `Task` via `@ehr/tasks` (spec §5.6:
 * "Critical result alerts must be durable workflow tasks, not transient UI notifications").
 */
export class DiagnosticReportService {
  constructor(
    private readonly repo: DiagnosticReportRepository = new DiagnosticReportRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
    private readonly orderRepo: OrderRepository = new OrderRepository(),
    private readonly observationService: ObservationService = new ObservationService(),
    private readonly taskService: TaskService = new TaskService(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateDiagnosticReportInput): Promise<DiagnosticReportRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });
    if (encounter.patientId !== patientId) {
      throw new ConflictError('The encounter does not belong to this patient', { patientId, encounterId: input.encounterId });
    }

    if (input.orderId) {
      const order = await this.orderRepo.findById(trx, ctx.tenantId, input.orderId);
      if (!order) throw new NotFoundError('Order not found', { orderId: input.orderId });
    }

    const actorId = ctx.actor?.id ?? null;
    const report = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      orderId: input.orderId ?? null,
      patientId: encounter.patientId,
      encounterId: input.encounterId,
      codeSystem: input.codeSystem ?? null,
      code: input.code ?? null,
      displayName: input.displayName,
      conclusion: input.conclusion ?? null,
      performingLab: input.performingLab ?? null,
      criticalFlag: input.criticalFlag,
      abnormalFlag: input.abnormalFlag,
      amendsReportId: null,
      createdBy: actorId ?? ctx.tenantId,
    });

    for (const result of input.results) {
      await this.observationService.create(
        trx,
        ctx,
        input.encounterId,
        {
          category: 'laboratory',
          code: result.code,
          displayName: result.display,
          valueQuantity: result.valueQuantity ?? null,
          valueText: result.valueText ?? null,
          unit: result.unit ?? null,
        },
        input.orderId ? { orderId: input.orderId } : {},
      );
    }

    await this.emit(trx, ctx, report, 'diagnostic_report.created.v1', { displayName: report.displayName });

    if (report.criticalFlag) {
      await this.taskService.create(trx, ctx, {
        patientId: report.patientId,
        taskType: 'critical_result_review',
        title: `Critical result: ${report.displayName}`,
        priority: 'urgent',
        relatedResourceType: 'DiagnosticReport',
        relatedResourceId: report.id,
      });
      await this.emit(trx, ctx, report, 'diagnostic_report.critical.v1', { displayName: report.displayName });
    }

    return report;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<DiagnosticReportRow> {
    const report = await this.repo.findById(trx, ctx.tenantId, id);
    if (!report) throw new NotFoundError('Diagnostic report not found', { id });
    return report;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<DiagnosticReportRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async inbox(trx: Executor, ctx: RequestContext): Promise<DiagnosticReportRow[]> {
    return this.repo.listInbox(trx, ctx.tenantId);
  }

  async review(trx: Executor, ctx: RequestContext, id: string, reviewStatus: string): Promise<DiagnosticReportRow> {
    const current = await this.getById(trx, ctx, id);
    if (TERMINAL_REVIEW_STATUSES.includes(current.reviewStatus)) {
      throw new ConflictError('This report has already been acknowledged', { id });
    }
    const actorId = ctx.actor?.id ?? null;
    const reviewed = await this.repo.markReviewed(trx, ctx.tenantId, id, reviewStatus, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, reviewed, 'diagnostic_report.reviewed.v1', { reviewStatus });
    return reviewed;
  }

  /**
   * Additive amendment, same pattern as Phase 3's Note: creates a NEW report row referencing the
   * original via `amendsReportId`; the original's own row is never mutated (spec §11.2: "amended
   * result preserves prior version").
   */
  async amend(trx: Executor, ctx: RequestContext, id: string, input: CreateDiagnosticReportInput): Promise<DiagnosticReportRow> {
    const original = await this.getById(trx, ctx, id);

    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });

    const actorId = ctx.actor?.id ?? null;
    const amendment = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      orderId: input.orderId ?? original.orderId,
      patientId: encounter.patientId,
      encounterId: input.encounterId,
      codeSystem: input.codeSystem ?? null,
      code: input.code ?? null,
      displayName: input.displayName,
      conclusion: input.conclusion ?? null,
      performingLab: input.performingLab ?? null,
      criticalFlag: input.criticalFlag,
      abnormalFlag: input.abnormalFlag,
      amendsReportId: original.id,
      createdBy: actorId ?? ctx.tenantId,
    });

    for (const result of input.results) {
      await this.observationService.create(trx, ctx, input.encounterId, {
        category: 'laboratory',
        code: result.code,
        displayName: result.display,
        valueQuantity: result.valueQuantity ?? null,
        valueText: result.valueText ?? null,
        unit: result.unit ?? null,
      });
    }

    await this.emit(trx, ctx, amendment, 'diagnostic_report.amended.v1', { amendsReportId: original.id });
    return amendment;
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    report: DiagnosticReportRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'diagnostic_report',
          aggregate_id: report.id,
          aggregate_version: report.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
