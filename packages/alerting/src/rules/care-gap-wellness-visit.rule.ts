import { sql } from 'kysely';
import type { AlertFinding, AlertRule } from '../alert.types.js';

export interface CareGapWellnessVisitRuleOptions {
  /** Same "simplified proxy" framing as `quality_measure_annual_wellness_visit`'s own
   * `lookbackDays` param — a plain configurable window, not a certified measure specification. */
  lookbackDays: number;
}

/**
 * Epic-parity item 2's second care-gap rule — the per-patient companion to
 * `quality_measure_annual_wellness_visit`'s aggregate rate, same reasoning as
 * `care-gap-hba1c.rule.ts`'s own doc comment: the governed query already proves this population is
 * computable, this rule just emits one finding per gapped patient instead of a count.
 */
export function createCareGapWellnessVisitRule(options: CareGapWellnessVisitRuleOptions): AlertRule {
  return {
    key: 'care_gap_wellness_visit_overdue',
    description: 'Flags an active patient with no completed encounter within the configured lookback window.',
    async evaluate(db): Promise<AlertFinding[]> {
      const result = await sql<{ tenant_id: string; patient_id: string; last_encounter_at: Date | null }>`
        select p.tenant_id, p.id as patient_id, le.last_ended_at as last_encounter_at
        from patients p
        left join lateral (
          select max(e.ended_at) as last_ended_at
          from encounters e
          where e.patient_id = p.id and e.tenant_id = p.tenant_id and e.ended_at is not null
        ) le on true
        where p.status = 'active'
          and (le.last_ended_at is null or le.last_ended_at < now() - (${options.lookbackDays} || ' days')::interval)
      `.execute(db);

      return result.rows.map(
        (r): AlertFinding => ({
          ruleKey: 'care_gap_wellness_visit_overdue',
          dedupeKey: r.patient_id,
          severity: 'info',
          title: 'Annual wellness visit overdue',
          detail: { patientId: r.patient_id, measure: 'wellness_visit', lookbackDays: options.lookbackDays, lastEncounterAt: r.last_encounter_at },
          tenantId: r.tenant_id,
        }),
      );
    },
  };
}
