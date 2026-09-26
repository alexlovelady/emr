import { describe, expect, it } from 'vitest';
import { NoopLabOrderGateway } from './noop-lab-order-gateway.js';

describe('NoopLabOrderGateway', () => {
  it('echoes the order id back as the placer order number', async () => {
    const gateway = new NoopLabOrderGateway();
    const result = await gateway.submitOrder({
      orderId: 'order-1',
      orderType: 'lab',
      codeSystem: 'LOINC',
      code: '789-8',
      displayName: 'CBC',
      priority: 'routine',
    });
    expect(result.placerOrderNumber).toBe('order-1');
  });

  it('reports an unknown status since there is no real lab to check', async () => {
    const gateway = new NoopLabOrderGateway();
    await expect(gateway.checkStatus('order-1')).resolves.toBe('unknown');
  });
});
