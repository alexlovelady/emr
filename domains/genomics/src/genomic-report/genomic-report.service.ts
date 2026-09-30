import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '@ehr/clinical';
import { OrderRepository } from '@ehr/orders';
import { TaskService } from '@ehr/tasks';
import type { CreateGenomicReportInput } from './genomic-report.dto.js';
import { GenomicReportRepository, type GenomicFindingRow, type GenomicReportRow } from './genomic-report.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TERMINAL_REVIEW_STATUSES = ['acknowledged'];
const ACTIONABLE_SIGNIFICANCE = ['pathogenic', 'likely_pathogenic'];

export interface GenomicReportWithFindings extends GenomicReportRow {
  findings: GenomicFindingRow[];
}

/**
 * Epic-parity item 5 — discrete coded genomic test results, modeled directly on
 * `@ehr/results`' `DiagnosticReportService` (same encounter-scoped report shape, same
 * additive-amendment pattern, same review-status gate for portal visibility). The one behavioral
 * difference: a pathogenic/likely-pathogenic finding opens a durable `Task`
 * (`taskType: 'genomic_finding_review'`) the same way a critical diagnostic report does — an
 * actionable genetic finding needs the same "durable workflow task, not a transient notification"
 * treatment as EHR_BUILD_SPEC.md §5.6's critical-result rule already requires for lab results.
 */
export class GenomicReportService {
  constructor(
    private readonly repo: GenomicReportRepository = new GenomicReportRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
    private readonly orderRepo: OrderRepository = new OrderRepository(),
    private readonly taskService: TaskService = new TaskService(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateGenomicReportInput): Promise<GenomicReportWithFindings> {
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
      amendsReportId: null,
      createdBy: actorId ?? ctx.tenantId,
    });

    const findings: GenomicFindingRow[] = [];
    for (const finding of input.findings) {
      findings.push(
        await this.repo.createFinding(trx, {
          tenantId: ctx.tenantId,
          genomicReportId: report.id,
          geneSymbol: finding.geneSymbol,
          hgvsNotation: finding.hgvsNotation ?? null,
          variantDisplay: finding.variantDisplay ?? null,
          clinicalSignificance: finding.clinicalSignificance ?? null,
          phenotypeCategory: finding.phenotypeCategory ?? null,
          interpretation: finding.interpretation ?? null,
          createdBy: actorId ?? ctx.tenantId,
        }),
      );
    }

    await this.emit(trx, ctx, report, 'genomic_report.created.v1', { displayName: report.displayName });

    const actionable = findings.filter((f) => f.clinicalSignificance && ACTIONABLE_SIGNIFICANCE.includes(f.clinicalSignificance));
    if (actionable.length > 0) {
      await this.taskService.create(trx, ctx, {
        patientId: report.patientId,
        taskType: 'genomic_finding_review',
        title: `Actionable genomic finding: ${actionable.map((f) => f.geneSymbol).join(', ')}`,
        priority: 'urgent',
        relatedResourceType: 'GenomicReport',
        relatedResourceId: report.id,
      });
      await this.emit(trx, ctx, report, 'genomic_report.actionable_finding.v1', { genes: actionable.map((f) => f.geneSymbol) });
    }

    return { ...report, findings };
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<GenomicReportWithFindings> {
    const report = await this.repo.findById(trx, ctx.tenantId, id);
    if (!report) throw new NotFoundError('Genomic report not found', { id });
    const findings = await this.repo.listFindings(trx, ctx.tenantId, id);
    return { ...report, findings };
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<GenomicReportWithFindings[]> {
    const reports = await this.repo.listByPatient(trx, ctx.tenantId, patientId);
    return this.attachFindings(trx, ctx.tenantId, reports);
  }

  /** Portal-visible only — see `GenomicReportRepository.listReleasedByPatient`'s doc comment. */
  async listReleased(trx: Executor, ctx: RequestContext, patientId: string): Promise<GenomicReportWithFindings[]> {
    const reports = await this.repo.listReleasedByPatient(trx, ctx.tenantId, patientId);
    return this.attachFindings(trx, ctx.tenantId, reports);
  }

  /** N+1 per report is fine at this scale — same reasoning as clinician-web's payment-plan-detail
   * fetch (a patient rarely has more than a couple of genomic reports on file). */
  private async attachFindings(trx: Executor, tenantId: string, reports: GenomicReportRow[]): Promise<GenomicReportWithFindings[]> {
    return Promise.all(reports.map(async (report) => ({ ...report, findings: await this.repo.listFindings(trx, tenantId, report.id) })));
  }

  async inbox(trx: Executor, ctx: RequestContext): Promise<GenomicReportRow[]> {
    return this.repo.listInbox(trx, ctx.tenantId);
  }

  async review(trx: Executor, ctx: RequestContext, id: string, reviewStatus: string): Promise<GenomicReportRow> {
    const current = await this.repo.findById(trx, ctx.tenantId, id);
    if (!current) throw new NotFoundError('Genomic report not found', { id });
    if (TERMINAL_REVIEW_STATUSES.includes(current.reviewStatus)) {
      throw new ConflictError('This report has already been acknowledged', { id });
    }
    const actorId = ctx.actor?.id ?? null;
    const reviewed = await this.repo.markReviewed(trx, ctx.tenantId, id, reviewStatus, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, reviewed, 'genomic_report.reviewed.v1', { reviewStatus });
    return reviewed;
  }

  /** Additive amendment — same pattern as `DiagnosticReportService.amend`: a NEW report row
   * referencing the original via `amendsReportId`; the original is never mutated. */
  async amend(trx: Executor, ctx: RequestContext, id: string, input: CreateGenomicReportInput): Promise<GenomicReportWithFindings> {
    const original = await this.repo.findById(trx, ctx.tenantId, id);
    if (!original) throw new NotFoundError('Genomic report not found', { id });

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
      amendsReportId: original.id,
      createdBy: actorId ?? ctx.tenantId,
    });

    const findings: GenomicFindingRow[] = [];
    for (const finding of input.findings) {
      findings.push(
        await this.repo.createFinding(trx, {
          tenantId: ctx.tenantId,
          genomicReportId: amendment.id,
          geneSymbol: finding.geneSymbol,
          hgvsNotation: finding.hgvsNotation ?? null,
          variantDisplay: finding.variantDisplay ?? null,
          clinicalSignificance: finding.clinicalSignificance ?? null,
          phenotypeCategory: finding.phenotypeCategory ?? null,
          interpretation: finding.interpretation ?? null,
          createdBy: actorId ?? ctx.tenantId,
        }),
      );
    }

    await this.emit(trx, ctx, amendment, 'genomic_report.amended.v1', { amendsReportId: original.id });
    return { ...amendment, findings };
  }

  private async emit(trx: Executor, ctx: RequestContext, report: GenomicReportRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'genomic_report',
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
