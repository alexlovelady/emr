import type { PolicyLayer } from '../policy-layer.js';

/**
 * Layers 4-8 (§6.2). Phase 1 has no patient/clinical/consent domains yet, so these always
 * abstain (NOT_APPLICABLE) — they exist now so the fixed 8-layer order and PolicyEngine's
 * aggregation rule never have to change shape when later phases give them real logic. Each is
 * kept as its own named export (rather than one generic "always NOT_APPLICABLE" factory) so a
 * future implementation can replace exactly one without touching the others or the import list
 * in policy-engine.ts.
 */

/** Layer 4: e.g. "is this practitioner assigned to this patient" — needs Phase 2+ domains. */
export const resourceRelationshipLayer: PolicyLayer = {
  name: 'resource-relationship',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};

/** Layer 5: purpose-of-use / sensitivity-tag restrictions — needs Phase 3+ clinical data. */
export const purposeSensitivityLayer: PolicyLayer = {
  name: 'purpose-sensitivity',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};

/** Layer 6: patient consent / proxy-access rules — needs the consent/portal domains. */
export const consentProxyLayer: PolicyLayer = {
  name: 'consent-proxy',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};

/** Layer 7: state/special-law policy (42 CFR Part 2, minor consent, etc.) — needs Phase 2+. */
export const stateSpecialLawLayer: PolicyLayer = {
  name: 'state-special-law',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};

/**
 * Layer 8: emergency/break-glass override (§6.3). The `breakglass.invoke` permission exists in
 * the seeded catalog and the layer slot exists here, but it is not wired into any Phase 1
 * endpoint — there is no PHI yet to break glass into. Wiring this up requires: an explicit
 * user action, a reason code, an elevated audit event, time-limited access, and a compliance
 * review queue (spec §6.3) — none of which exist yet. Always abstaining here is deliberate, not
 * an oversight.
 */
export const breakGlassLayer: PolicyLayer = {
  name: 'break-glass',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};
