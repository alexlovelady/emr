import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AuthzContext, AuthzDecision } from './context.js';
import type { PolicyLayer } from './policy-layer.js';
import { tenantMembershipLayer } from './layers/tenant-membership.layer.js';
import { userStatusLayer } from './layers/user-status.layer.js';
import { rolePermissionLayer, ROLE_PERMISSION_LAYER_NAME } from './layers/role-permission.layer.js';
import {
  resourceRelationshipLayer,
  purposeSensitivityLayer,
  consentProxyLayer,
  stateSpecialLawLayer,
  breakGlassLayer,
} from './layers/stub-layers.js';

/** The exact §6.2 order. Do not reorder without updating the spec reference in comments here. */
export const DEFAULT_LAYERS: readonly PolicyLayer[] = [
  tenantMembershipLayer,
  userStatusLayer,
  rolePermissionLayer,
  resourceRelationshipLayer,
  purposeSensitivityLayer,
  consentProxyLayer,
  stateSpecialLawLayer,
  breakGlassLayer,
];

/**
 * Runs every layer in fixed order. Aggregation rule:
 *   - any layer returning DENY short-circuits the whole check to denied;
 *   - otherwise, the decision is allowed only if the role-permission layer returned ALLOW.
 * NOT_APPLICABLE never grants and never denies on its own — it means "this layer has no opinion
 * for this call" (e.g. Phase 1's stub layers, or tenant-membership when no target tenant is
 * known yet). This makes the role-permission layer the single source of a grant, while every
 * other layer is purely a veto — matching spec rule #3's "never bypass the authorization layer."
 */
export class PolicyEngine {
  constructor(private readonly layers: readonly PolicyLayer[] = DEFAULT_LAYERS) {}

  async authorize(ctx: AuthzContext, db: Kysely<DB> | Transaction<DB>): Promise<AuthzDecision> {
    let grantedByRolePermission = false;

    for (const layer of this.layers) {
      const result = await layer.evaluate(ctx, db);
      if (result === 'DENY') {
        return { allowed: false, deniedBy: layer.name };
      }
      if (layer.name === ROLE_PERMISSION_LAYER_NAME && result === 'ALLOW') {
        grantedByRolePermission = true;
      }
    }

    return grantedByRolePermission
      ? { allowed: true }
      : { allowed: false, deniedBy: ROLE_PERMISSION_LAYER_NAME };
  }
}
