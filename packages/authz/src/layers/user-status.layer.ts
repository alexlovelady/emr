import type { PolicyLayer } from '../policy-layer.js';

/** Layer 2 (§6.2). Real: a disabled/locked/invited user is denied regardless of role grants. */
export const userStatusLayer: PolicyLayer = {
  name: 'user-status',
  async evaluate(ctx, db) {
    if (ctx.actor.type !== 'user') return 'NOT_APPLICABLE';

    const row = await db
      .selectFrom('users')
      .select('status')
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', ctx.actor.id)
      .executeTakeFirst();

    if (!row) return 'DENY';
    return row.status === 'active' ? 'ALLOW' : 'DENY';
  },
};
