import type { PolicyLayer } from '../policy-layer.js';

export const BREAK_GLASS_LAYER_NAME = 'break-glass';

/**
 * Layer 8 (§6.3), item 22: real implementation. Checks for an active (not revoked, not expired)
 * break-glass grant for this exact actor+patient — see `packages/authz/src/breakglass/
 * breakglass.repository.ts` for how a grant is created (`POST /api/v1/auth/breakglass`, an
 * explicit user action requiring a reason code and justification). Returning `ALLOW` here does
 * NOT by itself grant access — `PolicyEngine.authorize()` only lets it override a contextual DENY
 * from layers 4-7, and only when the role-permission layer already granted the underlying
 * permission (see that method's own doc comment for the full reasoning). Every current tenant has
 * zero rows in `breakglass_grants` until someone explicitly invokes it, so this layer has no effect
 * on any existing request.
 */
export const breakGlassLayer: PolicyLayer = {
  name: BREAK_GLASS_LAYER_NAME,
  async evaluate(ctx, db) {
    if (ctx.actor.type !== 'user' || !ctx.resource?.id) return 'NOT_APPLICABLE';

    const grant = await db
      .selectFrom('breakglass_grants')
      .select('id')
      .where('tenant_id', '=', ctx.tenantId)
      .where('user_id', '=', ctx.actor.id)
      .where('patient_id', '=', ctx.resource.id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();

    return grant ? 'ALLOW' : 'NOT_APPLICABLE';
  },
};
