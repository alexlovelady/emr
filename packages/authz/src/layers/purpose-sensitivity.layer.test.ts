import { describe, expect, it } from 'vitest';
import { purposeSensitivityLayer } from './purpose-sensitivity.layer.js';
import type { AuthzContext } from '../context.js';

const fakeDb = {} as never; // never touched by the NOT_APPLICABLE early-return paths below

describe('purposeSensitivityLayer', () => {
  it('abstains for any action other than problem.manage', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'u1', type: 'user' },
      action: 'patient.read.clinical',
      resource: { type: 'problem', id: 'p1' },
      purpose: 'payment',
      requestId: 'r1',
    };
    expect(await purposeSensitivityLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains when no resource id is present', async () => {
    const ctx: AuthzContext = { tenantId: 't1', actor: { id: 'u1', type: 'user' }, action: 'problem.manage', purpose: 'payment', requestId: 'r1' };
    expect(await purposeSensitivityLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains when purpose is unset — the default for every current caller', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'u1', type: 'user' },
      action: 'problem.manage',
      resource: { type: 'problem', id: 'p1' },
      requestId: 'r1',
    };
    expect(await purposeSensitivityLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains when purpose is explicitly "treatment"', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'u1', type: 'user' },
      action: 'problem.manage',
      resource: { type: 'problem', id: 'p1' },
      purpose: 'treatment',
      requestId: 'r1',
    };
    expect(await purposeSensitivityLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });
});
