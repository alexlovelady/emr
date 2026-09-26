import type { PolicyLayer } from '../policy-layer.js';

export const ROLE_PERMISSION_LAYER_NAME = 'role-permission';

/**
 * Layer 3 (§6.2). The actual grant check: does an active (non-revoked) role assignment for this
 * user in this tenant carry the requested permission key. This is the ONLY layer PolicyEngine
 * treats as capable of granting access — every other layer can only veto (DENY) or abstain
 * (NOT_APPLICABLE); see policy-engine.ts's aggregation rule.
 */
export const rolePermissionLayer: PolicyLayer = {
  name: ROLE_PERMISSION_LAYER_NAME,
  async evaluate(ctx, db) {
    if (ctx.actor.type !== 'user') {
      // Phase 1 has no service-account/API-client role grants yet (spec §29's
      // api.manage_clients permission exists in the catalog for when that lands).
      return 'DENY';
    }

    const grant = await db
      .selectFrom('user_roles')
      .innerJoin('role_permissions', 'role_permissions.role_id', 'user_roles.role_id')
      .select('role_permissions.permission_key')
      .where('user_roles.tenant_id', '=', ctx.tenantId)
      .where('user_roles.user_id', '=', ctx.actor.id)
      .where('user_roles.revoked_at', 'is', null)
      .where('role_permissions.permission_key', '=', ctx.action)
      .executeTakeFirst();

    return grant ? 'ALLOW' : 'DENY';
  },
};
