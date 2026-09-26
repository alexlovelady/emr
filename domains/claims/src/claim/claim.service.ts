import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { EncounterRepository } from '@ehr/clinical';
import { ChargeRepository, type ChargeRow } from '@ehr/billing';
import { CoverageRepository } from '@ehr/patient';
import { TaskService } from '@ehr/tasks';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import type { CreateClaimInput } from './claim.dto.js';
import { ClaimRepository, type ClaimRow } from './claim.repository.js';
import { ClaimVersionRepository, type ClaimVersionRow } from './claim-version.repository.js';
import { DenialRepository, type DenialRow } from '../denial/denial.repository.js';
import { scrubClaim } from './scrub-claim.js';

type Executor = Kysely<DB> | Transaction<DB>;

const PRE_SUBMIT_STATUSES = ['draft', 'rejected'];

export interface ClaimTimeline {
  claim: ClaimRow;
  versions: ClaimVersionRow[];
  denials: DenialRow[];
}

/**
 * EHR_BUILD_SPEC.md §13.2: "Never mutate a submitted claim in place" — `claims` carries current
 * state, `claim_versions` is the immutable history (ClaimVersion 1 draft, 2 submitted, 3+
 * corrected/resubmission — the spec's own literal example). `claims.status` continues the
 * Encounter state machine's own progression (which stops at `coding_review`) as a *separate*
 * state machine: draft -> submitted -> accepted/rejected -> adjudicated -> paid/denied.
 */
export class ClaimService {
  constructor(
    private readonly gateway: ClearinghouseGateway,
    private readonly repo: ClaimRepository = new ClaimRepository(),
    private readonly versionRepo: ClaimVersionRepository = new ClaimVersionRepository(),
    private readonly denialRepo: DenialRepository = new DenialRepository(),
    private readonly chargeRepo: ChargeRepository = new ChargeRepository(),
    private readonly encounterRepo: EncounterRepository = new EncounterRepository(),
    private readonly coverageRepo: CoverageRepository = new CoverageRepository(),
    private readonly taskService: TaskService = new TaskService(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateClaimInput): Promise<ClaimRow> {
    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, input.encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId: input.encounterId });
    if (encounter.patientId !== patientId) {
      throw new ConflictError('The encounter does not belong to this patient', { patientId, encounterId: input.encounterId });
    }

    const charges = await this.chargeRepo.findByIds(trx, ctx.tenantId, input.chargeIds);
    if (charges.length !== input.chargeIds.length) {
      throw new NotFoundError('One or more charges not found', { chargeIds: input.chargeIds });
    }
    for (const charge of charges) {
      if (charge.status !== 'coded') {
        throw new ConflictError(`Charge ${charge.id} must be coded before it can be claimed`, {
          chargeId: charge.id,
          status: charge.status,
        });
      }
      if (charge.encounterId !== input.encounterId) {
        throw new ConflictError(`Charge ${charge.id} does not belong to this encounter`, { chargeId: charge.id });
      }
    }

    if (input.coverageId) {
      const coverage = await this.coverageRepo.findById(trx, ctx.tenantId, input.coverageId);
      if (!coverage) throw new NotFoundError('Coverage not found', { coverageId: input.coverageId });
    }

    const totalChargeAmount = charges.reduce((sum, c) => sum + c.units * Number(c.unitPrice), 0);
    const actorId = ctx.actor?.id ?? null;

    const claim = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      encounterId: input.encounterId,
      coverageId: input.coverageId ?? null,
      billingPractitionerId: input.billingPractitionerId,
      totalChargeAmount: String(totalChargeAmount),
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.versionRepo.create(trx, {
      tenantId: ctx.tenantId,
      claimId: claim.id,
      versionNumber: 1,
      versionStatus: 'draft',
      payload: buildClaimPayload(claim, charges),
      clearinghouseTransactionId: null,
      submittedAt: null,
      createdBy: actorId ?? ctx.tenantId,
    });

    await this.chargeRepo.markBilled(
      trx,
      ctx.tenantId,
      charges.map((c) => c.id),
      claim.id,
      actorId ?? ctx.tenantId,
    );

    await this.emit(trx, ctx, claim, 'claim.created.v1', { totalChargeAmount: claim.totalChargeAmount });
    return claim;
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ClaimRow> {
    const claim = await this.repo.findById(trx, ctx.tenantId, id);
    if (!claim) throw new NotFoundError('Claim not found', { id });
    return claim;
  }

  async list(trx: Executor, ctx: RequestContext, patientId: string): Promise<ClaimRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async submit(trx: Executor, ctx: RequestContext, id: string): Promise<ClaimRow> {
    const claim = await this.getById(trx, ctx, id);
    if (!PRE_SUBMIT_STATUSES.includes(claim.status)) {
      throw new ConflictError(`Claim cannot be submitted from status '${claim.status}'`, { id, status: claim.status });
    }

    const charges = await this.chargeRepo.listByClaim(trx, ctx.tenantId, id);
    const issues = scrubClaim(Number(claim.totalChargeAmount), charges);
    if (issues.length > 0) {
      throw new ValidationError('Claim failed scrubber validation', { issues });
    }

    let payerName: string | null = null;
    let memberId: string | null = null;
    if (claim.coverageId) {
      const coverage = await this.coverageRepo.findById(trx, ctx.tenantId, claim.coverageId);
      if (coverage) {
        payerName = coverage.payerName;
        memberId = coverage.memberId;
      }
    }

    const receipt = await this.gateway.submitClaim({
      claimId: claim.id,
      totalChargeAmount: Number(claim.totalChargeAmount),
      payerName,
      memberId,
      charges: charges.map((c) => ({ code: c.code, units: c.units, unitPrice: Number(c.unitPrice), diagnosisCodes: c.diagnosisCodes })),
    });

    const actorId = ctx.actor?.id ?? null;
    const nextVersion = claim.currentVersion + 1;
    await this.versionRepo.create(trx, {
      tenantId: ctx.tenantId,
      claimId: claim.id,
      versionNumber: nextVersion,
      versionStatus: 'submitted',
      payload: buildClaimPayload(claim, charges),
      clearinghouseTransactionId: receipt.clearinghouseTransactionId,
      submittedAt: receipt.submittedAt,
      createdBy: actorId ?? ctx.tenantId,
    });

    const updated = await this.repo.recordSubmission(
      trx,
      ctx.tenantId,
      id,
      { currentVersion: nextVersion, clearinghouseTransactionId: receipt.clearinghouseTransactionId, status: 'submitted' },
      actorId ?? ctx.tenantId,
    );

    await this.emit(trx, ctx, updated, 'claim.submitted.v1', { clearinghouseTransactionId: receipt.clearinghouseTransactionId });
    return updated;
  }

  /**
   * Called by `apps/webhook-gateway` after it resolves the owning tenant via the owner-role
   * connection. Idempotent: a redelivered acknowledgement matching the claim's current status is
   * a no-op rather than a duplicate Denial/Task.
   */
  async recordAcknowledgement(
    trx: Executor,
    ctx: RequestContext,
    claimId: string,
    outcome: 'accepted' | 'rejected',
    rejection: { code: string; description: string } | null,
  ): Promise<ClaimRow> {
    const claim = await this.getById(trx, ctx, claimId);
    if (claim.status === outcome) {
      return claim;
    }
    if (claim.status !== 'submitted') {
      throw new ConflictError(`Claim cannot be acknowledged from status '${claim.status}'`, { id: claimId, status: claim.status });
    }

    const actorId = ctx.actor?.id ?? null;
    const updated = await this.repo.setStatus(trx, ctx.tenantId, claimId, outcome, actorId ?? ctx.tenantId);
    await this.emit(trx, ctx, updated, 'claim.acknowledged.v1', { outcome });

    if (outcome === 'rejected') {
      await this.recordDenial(trx, ctx, updated, {
        code: rejection?.code ?? 'UNSPECIFIED',
        description: rejection?.description ?? 'Claim rejected by clearinghouse (277CA)',
      });
    }

    return updated;
  }

  /**
   * Opens a Denial + follow-up Task for a claim, and emits `claim.denied.v1`. Public so
   * `@ehr/payments`' RemittanceService (which already depends on `@ehr/claims` to update claim
   * status) can reuse this exact logic for an 835 that arrives with a denial code, rather than
   * duplicating Denial/Task creation in a second package.
   */
  async recordDenial(trx: Executor, ctx: RequestContext, claim: ClaimRow, reason: { code: string; description: string }): Promise<void> {
    const actorId = ctx.actor?.id ?? null;
    const task = await this.taskService.create(trx, ctx, {
      patientId: claim.patientId,
      taskType: 'claim_denial_review',
      title: `Claim denied: ${reason.description}`,
      priority: 'high',
      relatedResourceType: 'Claim',
      relatedResourceId: claim.id,
    });
    await this.denialRepo.create(trx, {
      tenantId: ctx.tenantId,
      claimId: claim.id,
      denialReasonCode: reason.code,
      denialReasonText: reason.description,
      taskId: task.id,
      createdBy: actorId ?? ctx.tenantId,
    });
    await this.emit(trx, ctx, claim, 'claim.denied.v1', { reasonCode: reason.code });
  }

  async timeline(trx: Executor, ctx: RequestContext, id: string): Promise<ClaimTimeline> {
    const claim = await this.getById(trx, ctx, id);
    const [versions, denials] = await Promise.all([
      this.versionRepo.listByClaim(trx, ctx.tenantId, id),
      this.denialRepo.listByClaim(trx, ctx.tenantId, id),
    ]);
    return { claim, versions, denials };
  }

  private async emit(trx: Executor, ctx: RequestContext, claim: ClaimRow, eventType: string, data: Record<string, unknown>): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'claim',
          aggregate_id: claim.id,
          aggregate_version: claim.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}

function buildClaimPayload(claim: ClaimRow, charges: ChargeRow[]): Record<string, unknown> {
  return {
    claimId: claim.id,
    totalChargeAmount: claim.totalChargeAmount,
    coverageId: claim.coverageId,
    billingPractitionerId: claim.billingPractitionerId,
    charges: charges.map((c) => ({
      code: `${c.codeSystem}:${c.code}`,
      description: c.description,
      units: c.units,
      unitPrice: c.unitPrice,
      diagnosisCodes: c.diagnosisCodes,
    })),
  };
}
