import { randomUUID } from 'node:crypto';
import type { ChargeCardRequest, ChargeCardResult, PaymentGateway } from './payment-gateway.js';

/** No real card processor exists in this environment. Every charge synchronously "succeeds". */
export class NoopPaymentGateway implements PaymentGateway {
  async chargeCard(_request: ChargeCardRequest): Promise<ChargeCardResult> {
    return { transactionId: `noop-payment-${randomUUID()}`, status: 'succeeded', failureReason: null };
  }
}
