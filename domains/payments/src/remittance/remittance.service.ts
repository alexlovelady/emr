import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { buildOutboxInsert } from '@ehr/outbox';
import { ClaimRepository, ClaimVersionRepository, type ClaimService } from '@ehr/claims';
import { LedgerService } from '../ledger/ledger.service.js';
import { RemittanceRepository, type RemittanceRow } from './remittance.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const PRE_REMITTANCE_STATUSES = ['accepted', 'adjudicated'];

export interface PostRemittanceInput {
  remittanceAdviceNumber: string | null;
  payerPaidAmount: number;
  adjustmentAmount: number;
  patientResponsibilityAmount: number;
  denialReasonCode: string | null;
  denialReasonText: string | null;
  rawPayload: Record<string, unknown>;
}

/**
 * EHR_BUILD_SPEC.md §13.1's remittance posting engine, completing the §5.2 chain
 * (`... -> ClaimVersion -> Remittance -> LedgerEntry`). Called by `apps/webhook-gateway` after it
 * resolves the owning tenant for an inbound 835. `@ehr/payments` already depends on `@ehr/claims`
 * to update claim status, so it reuses `ClaimService.recordDenial()` directly rather than
 * duplicating Denial/Task creation here.
 */
export class RemittanceService {
  constructor(
    private readonly claimService: ClaimService,
    private readonly repo: RemittanceRepository = new RemittanceRepository(),
    private readonly claimRepo: ClaimRepository = new ClaimRepository(),
    private readonly claimVersionRepo: ClaimVersionRepository = new ClaimVersionRepository(),
    private readonly ledgerService: LedgerService = new LedgerService(),
  ) {}

  async post(trx: Executor, ctx: RequestContext, claimId: string, input: PostRemittanceInput): Promise<RemittanceRow> {
    const claim = await this.claimRepo.findById(trx, ctx.tenantId, claimId);
    if (!claim) throw new NotFoundError('Claim not found', { id: claimId });

    if (input.remittanceAdviceNumber) {
      const existing = await this.repo.findByClaimAndAdviceNumber(trx, ctx.tenantId, claimId, input.remittanceAdviceNumber);
      if (existing) return existing; // idempotent redelivery
    }

    if (!PRE_REMITTANCE_STATUSES.includes(claim.status)) {
      throw new ConflictError(`Claim cannot receive a remittance from status '${claim.status}'`, { id: claimId, status: claim.status });
    }

    const versions = await this.claimVersionRepo.listByClaim(trx, ctx.tenantId, claimId);
    const latestVersion = versions[versions.length - 1];
    if (!latestVersion) throw new ConflictError('Claim has no submitted version to reconcile a remittance against', { id: claimId });

    const actorId = ctx.actor?.id ?? null;
    const remittance = await this.repo.create(trx, {
      tenantId: ctx.tenantId,
      claimId,
      claimVersionId: latestVersion.id,
      payerPaidAmount: String(input.payerPaidAmount),
      adjustmentAmount: String(input.adjustmentAmount),
      patientResponsibilityAmount: String(input.patientResponsibilityAmount),
      remittanceAdviceNumber: input.remittanceAdviceNumber,
      rawPayload: input.rawPayload,
      createdBy: actorId ?? ctx.tenantId,
    });

    if (input.payerPaidAmount > 0) {
      await this.ledgerService.postEntry(trx, ctx, {
        patientId: claim.patientId,
        claimId,
        entryType: 'payment',
        amount: String(-input.payerPaidAmount),
        description: `Payer payment (remittance ${input.remittanceAdviceNumber ?? remittance.id})`,
      });
    }
    if (input.adjustmentAmount > 0) {
      await this.ledgerService.postEntry(trx, ctx, {
        patientId: claim.patientId,
        claimId,
        entryType: 'adjustment',
        amount: String(-input.adjustmentAmount),
        description: `Contractual adjustment (remittance ${input.remittanceAdviceNumber ?? remittance.id})`,
      });
    }

    const accountedFor = input.payerPaidAmount + input.adjustmentAmount + input.patientResponsibilityAmount;
    const totalCharge = Number(claim.totalChargeAmount);
    const newStatus = input.denialReasonCode ? 'denied' : accountedFor >= totalCharge ? 'paid' : 'adjudicated';
    const updatedClaim = await this.claimRepo.setStatus(trx, ctx.tenantId, claimId, newStatus, actorId ?? ctx.tenantId);

    if (input.denialReasonCode) {
      await this.claimService.recordDenial(trx, ctx, updatedClaim, {
        code: input.denialReasonCode,
        description: input.denialReasonText ?? 'Denial reported on 835 remittance',
      });
    }

    await this.emit(trx, ctx, remittance, 'remittance.received.v1', { claimId, payerPaidAmount: remittance.payerPaidAmount });
    if (input.payerPaidAmount > 0) {
      await this.emit(trx, ctx, remittance, 'payment.posted.v1', { claimId, amount: remittance.payerPaidAmount });
    }

    return remittance;
  }

  async listByClaim(trx: Executor, ctx: RequestContext, claimId: string): Promise<RemittanceRow[]> {
    return this.repo.listByClaim(trx, ctx.tenantId, claimId);
  }

  private async emit(
    trx: Executor,
    ctx: RequestContext,
    remittance: RemittanceRow,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values(
        buildOutboxInsert({
          event_type: eventType,
          tenant_id: ctx.tenantId,
          aggregate_type: 'remittance',
          aggregate_id: remittance.id,
          aggregate_version: remittance.version,
          actor_id: ctx.actor?.id ?? null,
          correlation_id: ctx.correlationId,
          causation_id: null,
          data,
        }),
      )
      .execute();
  }
}
