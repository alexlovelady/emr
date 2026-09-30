/** Epic-parity item 2 — the fixed catalog of care-gap alert rule keys this endpoint surfaces.
 * Deliberately a closed list (not "any rule_key"), so this worklist can never accidentally expose
 * an unrelated ops-alert type (backup health, outbox backlog, etc.) alongside real care gaps. */
export const CARE_GAP_RULE_KEYS = ['care_gap_hba1c_overdue', 'care_gap_wellness_visit_overdue'] as const;
export type CareGapRuleKey = (typeof CARE_GAP_RULE_KEYS)[number];

export interface CareGapWorklistItem {
  id: string;
  ruleKey: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  openedAt: Date;
  patientId: string | null;
  patientName: string | null;
}
