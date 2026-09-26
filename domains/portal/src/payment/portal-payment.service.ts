import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import { LedgerService, type LedgerEntryRow } from '@ehr/payments';
import type { PaymentGateway } from '@ehr/payment-adapter';
import type { ChargePaymentInput } from './portal-payment.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PortalPaymentResult {
  transactionId: string;
  status: 'succeeded' | 'failed';
  failureReason: string | null;
  ledgerEntry: LedgerEntryRow | null;
}

/**
 * A successful charge posts a `patient_payment` ledger entry via `@ehr/payments`'s existing
 * `LedgerService.postEntry()` — a value the check constraint already allowed (migration
 * `0025_payments_core.ts`) but nothing had exercised until now (EHR_BUILD_SPEC.md §13.1/§17).
 */
export class PortalPaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly consentService: ConsentService = new ConsentService(),
    private readonly ledgerService: LedgerService = new LedgerService(),
  ) {}

  async charge(trx: Executor, ctx: RequestContext, patientId: string, input: ChargePaymentInput): Promise<PortalPaymentResult> {
    if (ctx.actor?.type !== 'patient') throw new NotFoundError('Patient not found', { patientId });
    await this.consentService.assertAccess(trx, ctx.tenantId, ctx.actor.id, patientId);

    const result = await this.gateway.chargeCard({
      patientId,
      amountCents: input.amountCents,
      currency: input.currency,
      paymentMethodToken: input.paymentMethodToken,
    });

    if (result.status !== 'succeeded') {
      return { transactionId: result.transactionId, status: result.status, failureReason: result.failureReason, ledgerEntry: null };
    }

    const ledgerEntry = await this.ledgerService.postEntry(trx, ctx, {
      patientId,
      claimId: null,
      entryType: 'patient_payment',
      amount: (-(input.amountCents / 100)).toFixed(2),
      description: `Patient payment (transaction ${result.transactionId})`,
    });

    return { transactionId: result.transactionId, status: 'succeeded', failureReason: null, ledgerEntry };
  }
}
