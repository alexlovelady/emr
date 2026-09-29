import { PERMISSION_KEYS } from '@ehr/db';
import type { PolicyLayer } from '../policy-layer.js';

/**
 * Layer 5 (§6.2), item 22: real implementation, deliberately zero blast radius by construction.
 * Every existing `problems` row has `sensitivity = null` (migration 0055 added the column with no
 * backfill), and every existing caller leaves `ctx.purpose` unset (nothing in `apps/api` populates
 * `RequestContext.purpose` from a real request yet — see `attachEhrContext`'s optional
 * `X-Purpose-Of-Use` header parsing). Since this layer only ever vetoes when BOTH a sensitivity tag
 * AND a non-treatment purpose are present, it cannot affect any current traffic no matter what
 * permission key is being checked, until a clinician explicitly tags a problem sensitive AND a
 * caller explicitly asserts a payment/operations purpose.
 *
 * This is a minimum-necessary-style check, not a real 42 CFR Part 2 (or other per-category legal)
 * implementation — see `problems.sensitivity`'s own migration doc comment for why per-category
 * legal handling is out of scope here. A DENY here can still be overridden by an active break-glass
 * grant (layer 8) — see policy-engine.ts's aggregation rule.
 */
export const purposeSensitivityLayer: PolicyLayer = {
  name: 'purpose-sensitivity',
  async evaluate(ctx, db) {
    if (ctx.action !== PERMISSION_KEYS.PROBLEM_MANAGE) return 'NOT_APPLICABLE';
    if (!ctx.resource?.id) return 'NOT_APPLICABLE';
    // Unset purpose defaults to "treatment" (ordinary clinical care) — the only case this layer can
    // ever veto is an explicit, non-treatment purpose asserted by the caller.
    if (ctx.purpose === undefined || ctx.purpose === 'treatment') return 'NOT_APPLICABLE';

    const problem = await db
      .selectFrom('problems')
      .select('sensitivity')
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', ctx.resource.id)
      .executeTakeFirst();

    return problem?.sensitivity ? 'DENY' : 'NOT_APPLICABLE';
  },
};
