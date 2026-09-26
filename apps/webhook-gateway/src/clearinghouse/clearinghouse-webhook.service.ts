import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { getCurrentTransaction, runWithRequestTransaction } from '@ehr/db';
import { NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { ClaimRepository, ClaimService } from '@ehr/claims';
import { RemittanceService, LedgerService } from '@ehr/payments';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { ClearinghouseAckSchema, ClearinghouseRemittanceSchema } from './clearinghouse-webhook.dto.js';

/**
 * EHR_BUILD_SPEC.md §5.2's chain, closing the loop: an inbound 277CA/835 (pre-structured JSON —
 * no real X12 parsing, spec §13.1's "buy" item) is correlated back to a `claims` row via the
 * clearinghouse's own transaction id, looked up through the OWNER connection (bypasses RLS —
 * we don't know the tenant yet), then all domain writes happen inside a tenant-scoped transaction
 * via `runWithRequestTransaction`, exactly like a normal request would after JWT verification —
 * except there is no staff actor here, so the built `RequestContext` carries no `actor` at all
 * (every domain service's `ctx.actor?.id ?? ctx.tenantId` fallback already handles that).
 */
export class ClearinghouseWebhookService {
  constructor(
    private readonly gateway: ClearinghouseGateway,
    private readonly appDb: Kysely<DB>,
    private readonly ownerDb: Kysely<DB>,
    private readonly claimRepo: ClaimRepository = new ClaimRepository(),
    private readonly ledgerService: LedgerService = new LedgerService(),
  ) {}

  async handle277ca(rawBody: string): Promise<{ status: string }> {
    const payload = ClearinghouseAckSchema.parse(parseJson(rawBody));

    const claim = await this.claimRepo.findByTransactionIdGlobal(this.ownerDb, payload.clearinghouseTransactionId);
    if (!claim) {
      throw new NotFoundError('No claim matches this clearinghouseTransactionId', {
        clearinghouseTransactionId: payload.clearinghouseTransactionId,
      });
    }

    const wasAlreadyAcknowledged = claim.status === payload.outcome;

    await runWithRequestTransaction(this.appDb, claim.tenantId, async () => {
      const trx = getCurrentTransaction();
      const ctx = buildSystemContext(claim.tenantId);
      const claimService = new ClaimService(this.gateway);
      const updated = await claimService.recordAcknowledgement(
        trx,
        ctx,
        claim.id,
        payload.outcome,
        payload.outcome === 'rejected'
          ? { code: payload.rejectionReasonCode!, description: payload.rejectionReasonDescription! }
          : null,
      );

      // Book the receivable exactly once, the first time a claim is genuinely accepted (not on
      // idempotent redelivery) — spec §5.2's chain posts a LedgerEntry once a Claim is accepted,
      // not merely submitted, since acceptance is the point the payer has agreed to adjudicate it.
      if (!wasAlreadyAcknowledged && payload.outcome === 'accepted') {
        await this.ledgerService.postEntry(trx, ctx, {
          patientId: updated.patientId,
          claimId: updated.id,
          entryType: 'charge',
          amount: updated.totalChargeAmount,
          description: `Charge for accepted claim ${updated.id}`,
        });
      }
    });

    return { status: 'processed' };
  }

  async handle835(rawBody: string): Promise<{ status: string }> {
    const payload = ClearinghouseRemittanceSchema.parse(parseJson(rawBody));

    const claim = await this.claimRepo.findByTransactionIdGlobal(this.ownerDb, payload.clearinghouseTransactionId);
    if (!claim) {
      throw new NotFoundError('No claim matches this clearinghouseTransactionId', {
        clearinghouseTransactionId: payload.clearinghouseTransactionId,
      });
    }

    await runWithRequestTransaction(this.appDb, claim.tenantId, async () => {
      const trx = getCurrentTransaction();
      const ctx = buildSystemContext(claim.tenantId);
      const claimService = new ClaimService(this.gateway);
      const remittanceService = new RemittanceService(claimService);
      await remittanceService.post(trx, ctx, claim.id, {
        remittanceAdviceNumber: payload.remittanceAdviceNumber ?? null,
        payerPaidAmount: payload.payerPaidAmount,
        adjustmentAmount: payload.adjustmentAmount,
        patientResponsibilityAmount: payload.patientResponsibilityAmount,
        denialReasonCode: payload.denialReasonCode ?? null,
        denialReasonText: payload.denialReasonText ?? null,
        rawPayload: { ...payload },
      });
    });

    return { status: 'processed' };
  }
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ValidationError('Webhook body is not valid JSON');
  }
}

function buildSystemContext(tenantId: string): RequestContext {
  return { tenantId, requestId: randomUUID(), correlationId: randomUUID() };
}
