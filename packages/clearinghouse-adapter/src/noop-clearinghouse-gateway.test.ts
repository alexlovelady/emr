import { describe, expect, it } from 'vitest';
import { NoopClearinghouseGateway } from './noop-clearinghouse-gateway.js';

describe('NoopClearinghouseGateway', () => {
  it('returns a fixed eligible result', async () => {
    const gateway = new NoopClearinghouseGateway();
    const result = await gateway.checkEligibility({ payerName: 'Acme Payer', memberId: 'M123', patientName: 'Test Patient' });
    expect(result).toEqual({ isEligible: true, copayAmount: 25, deductibleRemaining: 500 });
  });

  it('accepts a claim submission synchronously with a generated transaction id', async () => {
    const gateway = new NoopClearinghouseGateway();
    const receipt = await gateway.submitClaim({
      claimId: 'claim-1',
      totalChargeAmount: 150,
      payerName: 'Acme Payer',
      memberId: 'M123',
      charges: [{ code: '99213', units: 1, unitPrice: 150, diagnosisCodes: ['E11.9'] }],
    });
    expect(receipt.clearinghouseTransactionId).toMatch(/^noop-claim-/);
    expect(receipt.submittedAt).toBeInstanceOf(Date);
  });

  it('reports an unknown status since there is no real clearinghouse to check', async () => {
    const gateway = new NoopClearinghouseGateway();
    await expect(gateway.checkClaimStatus('noop-claim-1')).resolves.toBe('unknown');
  });
});
