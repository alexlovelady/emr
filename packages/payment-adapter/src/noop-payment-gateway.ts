import { randomUUID } from 'node:crypto';
import type { ChargeAchRequest, ChargeAchResult, ChargeCardRequest, ChargeCardResult, PaymentGateway } from './payment-gateway.js';

/**
 * No real card processor or ACH network exists in this environment. Every charge synchronously
 * "succeeds" — including `chargeAch`, which in reality would often come back `'pending'` for
 * several days; this stub never exercises that state.
 */
export class NoopPaymentGateway implements PaymentGateway {
  async chargeCard(_request: ChargeCardRequest): Promise<ChargeCardResult> {
    return { transactionId: `noop-payment-${randomUUID()}`, status: 'succeeded', failureReason: null };
  }

  async chargeAch(_request: ChargeAchRequest): Promise<ChargeAchResult> {
    return { transactionId: `noop-ach-${randomUUID()}`, status: 'succeeded', failureReason: null };
  }
}
