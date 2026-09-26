import type { PolicyLayer } from '../policy-layer.js';

/**
 * Layer 1 (EHR_BUILD_SPEC.md §6.2). Real, but only activates when the caller already knows the
 * target resource's tenant (`ctx.resource.tenantId` set) — see context.ts's doc comment on why
 * Phase 1's ordinary endpoints leave this NOT_APPLICABLE and rely on Row-Level Security instead.
 */
export const tenantMembershipLayer: PolicyLayer = {
  name: 'tenant-membership',
  async evaluate(ctx) {
    if (ctx.resource?.tenantId === undefined) return 'NOT_APPLICABLE';
    return ctx.resource.tenantId === ctx.tenantId ? 'ALLOW' : 'DENY';
  },
};
