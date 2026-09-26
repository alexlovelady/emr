import { describe, expect, it } from 'vitest';
import { tenantMembershipLayer } from './tenant-membership.layer.js';
import type { AuthzContext } from '../context.js';

const baseCtx: AuthzContext = {
  tenantId: 't1',
  actor: { id: 'u1', type: 'user' },
  action: 'location.manage',
  requestId: 'r1',
};
const fakeDb = {} as never;

describe('tenantMembershipLayer', () => {
  it('abstains when no target tenant is known yet', async () => {
    expect(await tenantMembershipLayer.evaluate(baseCtx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('allows when the resource tenant matches the caller tenant', async () => {
    const ctx = { ...baseCtx, resource: { type: 'Location', tenantId: 't1' } };
    expect(await tenantMembershipLayer.evaluate(ctx, fakeDb)).toBe('ALLOW');
  });

  it('denies when the resource tenant does not match', async () => {
    const ctx = { ...baseCtx, resource: { type: 'Location', tenantId: 't2' } };
    expect(await tenantMembershipLayer.evaluate(ctx, fakeDb)).toBe('DENY');
  });
});
