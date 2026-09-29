import { sql } from 'kysely';
import { ageInYears } from '@ehr/age-utils';
import type { AlertFinding, AlertRule } from '../alert.types.js';

export interface MinorConsentTransitionRuleOptions {
  /**
   * A plain configurable number — deliberately NOT a real state-by-state age-of-majority/
   * age-of-consent determination. Real per-state legal rule content is a business/legal-review
   * gate (see `domains/consent`'s own README and migration `0029_patient_proxy_grants.ts`'s doc
   * comment: "Minor/state-law consent transition rules are explicitly NOT computed here"); 18 is
   * used only as a common, honest, engineering-level default for "flag this for a human to look
   * at," never presented as a legal conclusion.
   */
  ageThresholdYears: number;
}

/**
 * Item 20's "mechanism, not rule content" consent-transition gap: nothing previously noticed when
 * a minor patient with an active parent/guardian proxy grant reached an age where that access
 * might need review. This rule only DETECTS and FLAGS the condition — it never auto-revokes or
 * auto-extends a grant. The actual decision (revoke via the existing `POST /proxy-grants/:id/
 * revoke`, extend `effectiveEnd`, or leave it as clinically/legally appropriate) stays a real
 * human's call, resolved the same way any other alert is resolved (`POST /alerts/:id/resolve`) once
 * reviewed — see `domains/consent/src/proxy-grant/proxy-grant.service.ts`'s `assertAccess()` doc
 * comment, which explicitly leaves this exact decision point open for a mechanism like this one.
 */
export function createMinorConsentTransitionRule(options: MinorConsentTransitionRuleOptions): AlertRule {
  return {
    key: 'minor_consent_transition',
    description: 'Flags an active non-self proxy grant once the patient has reached the configured age threshold, for staff review.',
    async evaluate(db): Promise<AlertFinding[]> {
      const rows = await db
        .selectFrom('patient_proxy_grants as g')
        .innerJoin('patients as p', 'p.id', 'g.patient_id')
        .select(['g.id as grant_id', 'g.tenant_id', 'g.patient_id', 'g.relationship_type', 'g.effective_start', 'p.date_of_birth'])
        .where('g.status', '=', 'active')
        .where('g.relationship_type', '!=', 'self')
        .where((eb) => eb.or([eb('g.effective_end', 'is', null), eb('g.effective_end', '>=', sql<Date>`current_date`)]))
        .execute();

      const now = new Date();
      return rows
        .filter((r) => ageInYears(r.date_of_birth, now) >= options.ageThresholdYears)
        .map(
          (r): AlertFinding => ({
            ruleKey: 'minor_consent_transition',
            dedupeKey: r.grant_id,
            severity: 'warning',
            title: 'Proxy access grant needs review — patient has reached the consent-transition age threshold',
            detail: {
              grantId: r.grant_id,
              patientId: r.patient_id,
              relationshipType: r.relationship_type,
              patientAge: ageInYears(r.date_of_birth, now),
              ageThresholdYears: options.ageThresholdYears,
              grantEffectiveStart: r.effective_start,
            },
            tenantId: r.tenant_id,
          }),
        );
    },
  };
}
