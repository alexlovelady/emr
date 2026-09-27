import { describe, expect, it } from 'vitest';
import { NoopInteractionCheckGateway } from './noop-interaction-check-gateway.js';

describe('NoopInteractionCheckGateway', () => {
  it('always returns no findings, regardless of input — this is a stub, not a real check', async () => {
    const gateway = new NoopInteractionCheckGateway();
    const findings = await gateway.checkInteractions({
      rxnormCodes: ['314076', '855332'],
      allergyCodes: ['7980'],
    });
    expect(findings).toEqual([]);
  });

  it('returns no findings for empty input too', async () => {
    const gateway = new NoopInteractionCheckGateway();
    await expect(gateway.checkInteractions({ rxnormCodes: [], allergyCodes: [] })).resolves.toEqual([]);
  });
});
