import { describe, expect, it } from 'vitest';
import { consentProxyLayer, stateSpecialLawLayer } from './stub-layers.js';
import type { AuthzContext } from '../context.js';

const ctx: AuthzContext = { tenantId: 't1', actor: { id: 'u1', type: 'user' }, action: 'x', requestId: 'r1' };
const fakeDb = {} as never;

describe('remaining stub layers (item 22 left these two alone — see stub-layers.ts doc comment)', () => {
  it.each([
    ['consent-proxy', consentProxyLayer],
    ['state-special-law', stateSpecialLawLayer],
  ] as const)('%s always abstains', async (_name, layer) => {
    expect(await layer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });
});
