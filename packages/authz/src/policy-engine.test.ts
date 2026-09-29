import { describe, expect, it } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import type { AuthzContext } from './context.js';
import type { LayerResult, PolicyLayer } from './policy-layer.js';

function fakeLayer(name: string, result: LayerResult): PolicyLayer {
  return { name, evaluate: async () => result };
}

const ctx: AuthzContext = {
  tenantId: 't1',
  actor: { id: 'u1', type: 'user' },
  action: 'location.manage',
  requestId: 'r1',
};
const fakeDb = {} as never;

describe('PolicyEngine', () => {
  it('denies when no layer grants (default deny)', async () => {
    const engine = new PolicyEngine([fakeLayer('a', 'NOT_APPLICABLE'), fakeLayer('b', 'NOT_APPLICABLE')]);
    const decision = await engine.authorize(ctx, fakeDb);
    expect(decision).toEqual({ allowed: false, deniedBy: 'role-permission' });
  });

  it('allows only when the role-permission layer explicitly grants', async () => {
    const engine = new PolicyEngine([
      fakeLayer('tenant-membership', 'NOT_APPLICABLE'),
      fakeLayer('role-permission', 'ALLOW'),
      fakeLayer('trailing-stub', 'NOT_APPLICABLE'),
    ]);
    const decision = await engine.authorize(ctx, fakeDb);
    expect(decision).toEqual({ allowed: true });
  });

  it('a DENY from any layer short-circuits, even after role-permission already allowed', async () => {
    const engine = new PolicyEngine([
      fakeLayer('role-permission', 'ALLOW'),
      fakeLayer('consent-proxy', 'DENY'),
    ]);
    const decision = await engine.authorize(ctx, fakeDb);
    expect(decision).toEqual({ allowed: false, deniedBy: 'consent-proxy' });
  });

  it('a DENY from an early layer short-circuits before later layers run', async () => {
    let laterLayerCalled = false;
    const engine = new PolicyEngine([
      fakeLayer('user-status', 'DENY'),
      {
        name: 'role-permission',
        evaluate: async () => {
          laterLayerCalled = true;
          return 'ALLOW';
        },
      },
    ]);
    const decision = await engine.authorize(ctx, fakeDb);
    expect(decision).toEqual({ allowed: false, deniedBy: 'user-status' });
    expect(laterLayerCalled).toBe(false);
  });

  describe('item 22: break-glass override', () => {
    it('an active break-glass grant overrides a contextual DENY from a layer-4-7 veto', async () => {
      const engine = new PolicyEngine([
        fakeLayer('role-permission', 'ALLOW'),
        fakeLayer('resource-relationship', 'DENY'),
        fakeLayer('break-glass', 'ALLOW'),
      ]);
      const decision = await engine.authorize(ctx, fakeDb);
      expect(decision).toEqual({ allowed: true, breakGlass: true, overrodeDeny: 'resource-relationship' });
    });

    it('break-glass cannot override a hard DENY from role-permission (no underlying grant to override with)', async () => {
      const engine = new PolicyEngine([
        fakeLayer('role-permission', 'DENY'),
        fakeLayer('break-glass', 'ALLOW'),
      ]);
      const decision = await engine.authorize(ctx, fakeDb);
      expect(decision).toEqual({ allowed: false, deniedBy: 'role-permission' });
    });

    it('break-glass cannot override a hard DENY from user-status or tenant-membership (layers 1-3 still short-circuit immediately)', async () => {
      let breakGlassCalled = false;
      const engine = new PolicyEngine([
        fakeLayer('user-status', 'DENY'),
        fakeLayer('role-permission', 'ALLOW'),
        {
          name: 'break-glass',
          evaluate: async () => {
            breakGlassCalled = true;
            return 'ALLOW';
          },
        },
      ]);
      const decision = await engine.authorize(ctx, fakeDb);
      expect(decision).toEqual({ allowed: false, deniedBy: 'user-status' });
      expect(breakGlassCalled).toBe(false);
    });

    it('a contextual DENY without an active break-glass grant still denies normally', async () => {
      const engine = new PolicyEngine([
        fakeLayer('role-permission', 'ALLOW'),
        fakeLayer('purpose-sensitivity', 'DENY'),
        fakeLayer('break-glass', 'NOT_APPLICABLE'),
      ]);
      const decision = await engine.authorize(ctx, fakeDb);
      expect(decision).toEqual({ allowed: false, deniedBy: 'purpose-sensitivity' });
    });

    it('break-glass ALLOW with no contextual DENY at all has no effect (nothing to override)', async () => {
      const engine = new PolicyEngine([fakeLayer('role-permission', 'ALLOW'), fakeLayer('break-glass', 'ALLOW')]);
      const decision = await engine.authorize(ctx, fakeDb);
      expect(decision).toEqual({ allowed: true });
    });
  });
});
