import { describe, expect, it } from 'vitest';
import {
  resourceRelationshipLayer,
  purposeSensitivityLayer,
  consentProxyLayer,
  stateSpecialLawLayer,
  breakGlassLayer,
} from './stub-layers.js';
import type { AuthzContext } from '../context.js';

const ctx: AuthzContext = { tenantId: 't1', actor: { id: 'u1', type: 'user' }, action: 'x', requestId: 'r1' };
const fakeDb = {} as never;

describe('Phase 1 stub layers', () => {
  it.each([
    ['resource-relationship', resourceRelationshipLayer],
    ['purpose-sensitivity', purposeSensitivityLayer],
    ['consent-proxy', consentProxyLayer],
    ['state-special-law', stateSpecialLawLayer],
    ['break-glass', breakGlassLayer],
  ] as const)('%s always abstains in Phase 1', async (_name, layer) => {
    expect(await layer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });
});
