import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AuthzContext, AuthzDecision } from './context.js';
import type { PolicyLayer } from './policy-layer.js';
import { tenantMembershipLayer } from './layers/tenant-membership.layer.js';
import { userStatusLayer } from './layers/user-status.layer.js';
import { rolePermissionLayer, ROLE_PERMISSION_LAYER_NAME } from './layers/role-permission.layer.js';
import { resourceRelationshipLayer } from './layers/resource-relationship.layer.js';
import { consentProxyLayer, stateSpecialLawLayer } from './layers/stub-layers.js';
import { purposeSensitivityLayer } from './layers/purpose-sensitivity.layer.js';
import { breakGlassLayer, BREAK_GLASS_LAYER_NAME } from './layers/break-glass.layer.js';

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
 * A DENY from layer 4, 5, 6, or 7 is a CONTEXTUAL veto — spec §6.3's "emergency/break-glass
 * override where configured" means layer 8 must be able to clear exactly these, for a user who
 * already holds the underlying permission grant. A DENY from tenant-membership, user-status, or
 * role-permission (layers 1-3) is never overridable by break-glass — that would let break-glass
 * grant a permission the user's role doesn't have at all, or let a deactivated/cross-tenant caller
 * back in, neither of which is what "emergency access to a specific patient" is supposed to mean.
 */
const OVERRIDABLE_BY_BREAK_GLASS = new Set<string>([
  'resource-relationship',
  'purpose-sensitivity',
  'consent-proxy',
  'state-special-law',
]);

/**
 * Runs every layer in fixed order. Aggregation rule (item 22 extended this, see doc comment on
 * `OVERRIDABLE_BY_BREAK_GLASS` above for exactly what changed and why it's safe):
 *   - a DENY from layers 1-3 short-circuits immediately to denied, exactly as before item 22 —
 *     these are the same three layers that already existed, and none of the new layers can affect
 *     this path at all, so every pre-item-22 test's behavior for these is byte-for-byte unchanged;
 *   - a DENY from layers 4-7 is remembered but does NOT short-circuit — the loop continues so
 *     layer 8 (break-glass) gets a chance to run;
 *   - if break-glass evaluates ALLOW (an active, unexpired, unrevoked grant exists for this
 *     actor+resource) AND the role-permission layer already granted the underlying permission, the
 *     contextual DENY is overridden and the request is allowed;
 *   - otherwise, the first contextual DENY (if any) wins; failing that, the decision is allowed
 *     only if the role-permission layer returned ALLOW.
 * NOT_APPLICABLE never grants and never denies on its own. Before item 22, layers 4-7 always
 * returned NOT_APPLICABLE and layer 8 was unreachable in practice for any DENY — this aggregation
 * change has no observable effect on any call where every layer still behaves as it did then.
 */
export class PolicyEngine {
  constructor(private readonly layers: readonly PolicyLayer[] = DEFAULT_LAYERS) {}

  async authorize(ctx: AuthzContext, db: Kysely<DB> | Transaction<DB>): Promise<AuthzDecision> {
    let grantedByRolePermission = false;
    let contextualDeny: string | undefined;

    for (const layer of this.layers) {
      const result = await layer.evaluate(ctx, db);

      if (result === 'DENY') {
        if (!OVERRIDABLE_BY_BREAK_GLASS.has(layer.name)) {
          return { allowed: false, deniedBy: layer.name };
        }
        contextualDeny ??= layer.name;
        continue;
      }

      if (layer.name === ROLE_PERMISSION_LAYER_NAME && result === 'ALLOW') {
        grantedByRolePermission = true;
      }
      if (layer.name === BREAK_GLASS_LAYER_NAME && result === 'ALLOW' && grantedByRolePermission && contextualDeny) {
        return { allowed: true, breakGlass: true, overrodeDeny: contextualDeny };
      }
    }

    if (contextualDeny) {
      return { allowed: false, deniedBy: contextualDeny };
    }
    return grantedByRolePermission ? { allowed: true } : { allowed: false, deniedBy: ROLE_PERMISSION_LAYER_NAME };
  }
}
