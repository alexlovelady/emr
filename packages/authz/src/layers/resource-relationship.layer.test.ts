import { describe, expect, it } from 'vitest';
import { resourceRelationshipLayer } from './resource-relationship.layer.js';
import type { AuthzContext } from '../context.js';

const fakeDb = {} as never; // never touched by the NOT_APPLICABLE early-return paths below

describe('resourceRelationshipLayer', () => {
  it('abstains for any action other than patient.read.care_team_scoped — zero effect on every existing role', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'u1', type: 'user' },
      action: 'patient.read.clinical',
      resource: { type: 'patient', id: 'p1' },
      requestId: 'r1',
    };
    expect(await resourceRelationshipLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains for a non-user actor even when the scoped action is used', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'sys', type: 'system' },
      action: 'patient.read.care_team_scoped',
      resource: { type: 'patient', id: 'p1' },
      requestId: 'r1',
    };
    expect(await resourceRelationshipLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });

  it('abstains when no resource id is present', async () => {
    const ctx: AuthzContext = {
      tenantId: 't1',
      actor: { id: 'u1', type: 'user' },
      action: 'patient.read.care_team_scoped',
      requestId: 'r1',
    };
    expect(await resourceRelationshipLayer.evaluate(ctx, fakeDb)).toBe('NOT_APPLICABLE');
  });
});
