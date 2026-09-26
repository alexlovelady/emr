import { describe, expect, it } from 'vitest';
import { NoopPaymentGateway } from './noop-payment-gateway.js';

describe('NoopPaymentGateway', () => {
  it('synchronously succeeds every charge with a generated transaction id', async () => {
    const gateway = new NoopPaymentGateway();
    const result = await gateway.chargeCard({
      patientId: 'patient-1',
      amountCents: 15000,
      currency: 'usd',
      paymentMethodToken: 'tok_test',
    });
    expect(result.status).toBe('succeeded');
    expect(result.transactionId).toMatch(/^noop-payment-/);
    expect(result.failureReason).toBeNull();
  });
});
