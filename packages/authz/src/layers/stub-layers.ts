import type { PolicyLayer } from '../policy-layer.js';

/**
 * Layers 6-7 (§6.2) — still genuinely stubbed. Layers 4 (`resource-relationship.layer.ts`), 5
 * (`purpose-sensitivity.layer.ts`), and 8 (`break-glass.layer.ts`) now have real implementations
 * (item 22) and live in their own files; these two remain here because they're the ones item 22
 * deliberately left alone:
 *
 * - Layer 6 (consent-proxy) is effectively already implemented, just NOT as a PolicyEngine layer —
 *   `domains/consent`'s `ConsentService.assertAccess()` is a separate, portal-specific mechanism
 *   that every `@ehr/portal`/`@ehr/messaging` route calls directly (see that service's own doc
 *   comment). A real layer 6 here would need to duplicate that same check for the staff-facing
 *   PolicyEngine path, which no current route needs (staff routes don't go through proxy consent
 *   at all). Left stubbed rather than built speculatively.
 * - Layer 7 (state-special-law — 42 CFR Part 2, state-specific minor-consent overrides, etc.) is
 *   real per-jurisdiction LEGAL RULE CONTENT, not a mechanism gap — the same business/legal-review
 *   gate item 20's own README note already describes for consent transitions. Not buildable here.
 */

/** Layer 6: patient consent / proxy-access rules — see doc comment above for why this stays stubbed. */
export const consentProxyLayer: PolicyLayer = {
  name: 'consent-proxy',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};

/** Layer 7: state/special-law policy (42 CFR Part 2, minor consent, etc.) — real legal content, business-gated. */
export const stateSpecialLawLayer: PolicyLayer = {
  name: 'state-special-law',
  async evaluate() {
    return 'NOT_APPLICABLE';
  },
};
