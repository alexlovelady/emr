import type { AlertFinding, AlertRule } from '../alert.types.js';

/**
 * Item 22 layer 8's compliance review queue (spec §6.3): every `breakglass_grants` row with
 * `reviewed_at is null` stays flagged, regardless of age — a real emergency-access invocation
 * always needs a human to look at it, whether that happens five minutes or five days later. Once
 * `POST /api/v1/auth/breakglass/:id/review` sets `reviewed_at`, the grant stops appearing in this
 * rule's findings and `AlertEvaluator.resolveStale()` closes the alert automatically on the next
 * tick — no separate "resolve" action needed for this specific alert type.
 */
export function createBreakglassReviewRule(): AlertRule {
  return {
    key: 'breakglass_review',
    description: 'Flags every break-glass emergency-access grant that has not yet been reviewed.',
    async evaluate(db): Promise<AlertFinding[]> {
      const rows = await db
        .selectFrom('breakglass_grants')
        .select(['id', 'tenant_id', 'user_id', 'patient_id', 'reason_code', 'justification', 'granted_at', 'expires_at', 'revoked_at'])
        .where('reviewed_at', 'is', null)
        .execute();

      return rows.map(
        (r): AlertFinding => ({
          ruleKey: 'breakglass_review',
          dedupeKey: r.id,
          severity: 'critical',
          title: 'Break-glass emergency access grant needs compliance review',
          detail: {
            grantId: r.id,
            userId: r.user_id,
            patientId: r.patient_id,
            reasonCode: r.reason_code,
            justification: r.justification,
            grantedAt: r.granted_at.toISOString(),
            expiresAt: r.expires_at.toISOString(),
            revoked: r.revoked_at !== null,
          },
          tenantId: r.tenant_id,
        }),
      );
    },
  };
}
