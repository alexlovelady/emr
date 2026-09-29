import { describe, expect, it } from 'vitest';
import { breakGlassLayer } from './break-glass.layer.js';
import type { AuthzContext } from '../context.js';

const fakeDb = {} as never;

describe('breakGlassLayer', () => {
  it('abstains for a non-user actor', async () => {
    const ctx: AuthzContext = { tenantId: 't1', actor: { id: 's1', type: 'system' }, action: 'x', resource: { type: 'patient', id: 'p1' }, requestId: 'r1' };
    expect(await breakGlassLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains when no resource id is present', async () => {
    const ctx: AuthzContext = { tenantId: 't1', actor: { id: 'u1', type: 'user' }, action: 'x', requestId: 'r1' };
    expect(await breakGlassLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });
});
