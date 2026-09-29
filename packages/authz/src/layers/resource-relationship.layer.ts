import { PERMISSION_KEYS } from '@ehr/db';
import type { PolicyLayer } from '../policy-layer.js';

/**
 * Layer 4 (§6.2), item 22: real implementation, deliberately opt-in and zero blast radius. It is
 * ONLY active for the narrow `patient.read.care_team_scoped` permission key — every existing role
 * using the broader `patient.read.clinical`/`patient.read.demographics` keys is completely
 * unaffected (this layer returns `NOT_APPLICABLE` for them, exactly as the old stub did for
 * everything). No seeded role grants `patient.read.care_team_scoped`, so this layer has no effect
 * on any current tenant unless an admin explicitly assigns that permission to a role.
 *
 * When it IS the action being checked, `ctx.resource.id` is treated as the target patient id (the
 * only routes that should ever check this permission key are patient-scoped, by construction — see
 * `PATIENT_READ_CARE_TEAM_SCOPED`'s own doc comment) and this layer vetoes (DENY) unless the acting
 * user resolves to a practitioner who has at least one encounter or appointment with that patient
 * in this tenant. A DENY here can still be overridden by an active break-glass grant (layer 8) —
 * see policy-engine.ts's aggregation rule.
 */
export const resourceRelationshipLayer: PolicyLayer = {
  name: 'resource-relationship',
  async evaluate(ctx, db) {
    if (ctx.action !== PERMISSION_KEYS.PATIENT_READ_CARE_TEAM_SCOPED) return 'NOT_APPLICABLE';
    if (ctx.actor.type !== 'user' || !ctx.resource?.id) return 'NOT_APPLICABLE';

    const patientId = ctx.resource.id;
    const hasRelationship = await db
      .selectFrom('practitioners as pr')
      .innerJoin('workforce_identities as wi', 'wi.id', 'pr.workforce_identity_id')
      .where('wi.tenant_id', '=', ctx.tenantId)
      .where('wi.user_id', '=', ctx.actor.id)
      .where('pr.tenant_id', '=', ctx.tenantId)
      .where((eb) =>
        eb.or([
          eb.exists(
            eb
              .selectFrom('encounters as e')
              .select('e.id')
              .whereRef('e.practitioner_id', '=', 'pr.id')
              .where('e.tenant_id', '=', ctx.tenantId)
              .where('e.patient_id', '=', patientId),
          ),
          eb.exists(
            eb
              .selectFrom('appointments as a')
              .select('a.id')
              .whereRef('a.practitioner_id', '=', 'pr.id')
              .where('a.tenant_id', '=', ctx.tenantId)
              .where('a.patient_id', '=', patientId),
          ),
        ]),
      )
      .executeTakeFirst();

    return hasRelationship ? 'NOT_APPLICABLE' : 'DENY';
  },
};
