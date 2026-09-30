import { sql } from 'kysely';
import type { AlertFinding, AlertRule } from '../alert.types.js';

/** LOINC code for Hemoglobin A1c — matches `domains/query`'s `quality_measure_diabetes_hba1c_control`
 * governed query and the cohort compiler's `latest_hba1c` measure, all three of which key off the
 * same value. */
const HBA1C_LOINC_CODE = '4548-4';

export interface CareGapHba1cRuleOptions {
  /** A plain engineering lookback window, not a certified HEDIS/NCQA measure specification — same
   * "simplified proxy" framing `quality_measure_diabetes_hba1c_control` already uses for the exact
   * same population. */
  lookbackDays: number;
}

/**
 * Epic-parity item 2 (population health / "Healthy Planet" equivalent): a real care-gap worklist
 * needs *which patients* are gapped, not just an aggregate rate — `domains/query`'s
 * `quality_measure_diabetes_hba1c_control` governed query already computes this population
 * (`patientsWithNoRecentHba1c`) but collapses it to a count. This rule runs the identical
 * diabetic-cohort + latest-HbA1c logic, generalized with a real lookback window (the governed
 * query only checks "ever had one at all," not "recently"), and emits one finding per gapped
 * patient instead of a number — reusing the exact same alerting mechanism (`AlertEvaluator`/
 * `AlertScheduler`, already running in `apps/worker`) as every other alert rule, and surfaced via
 * `apps/api`'s new tenant-scoped `/api/v1/care-gaps` endpoints rather than the generic ops-alerts
 * page (see that controller's own doc comment for why).
 */
export function createCareGapHba1cRule(options: CareGapHba1cRuleOptions): AlertRule {
  return {
    key: 'care_gap_hba1c_overdue',
    description: 'Flags an active diabetic patient whose most recent HbA1c is missing or older than the configured lookback window.',
    async evaluate(db): Promise<AlertFinding[]> {
      const result = await sql<{ tenant_id: string; patient_id: string; last_value_at: Date | null }>`
        with diabetic_patients as (
          select distinct pr.tenant_id, pr.patient_id
          from problems pr
          join patients p on p.id = pr.patient_id and p.tenant_id = pr.tenant_id
          where pr.code_system = 'ICD-10' and pr.code like 'E11%'
            and pr.clinical_status = 'active'
            and p.status = 'active'
        ),
        latest_hba1c as (
          select distinct on (o.patient_id) o.patient_id, o.effective_at
          from observations o
          where o.code = ${HBA1C_LOINC_CODE} and o.category = 'laboratory' and o.value_quantity is not null
          order by o.patient_id, o.effective_at desc
        )
        select dp.tenant_id, dp.patient_id, h.effective_at as last_value_at
        from diabetic_patients dp
        left join latest_hba1c h on h.patient_id = dp.patient_id
        where h.effective_at is null or h.effective_at < now() - (${options.lookbackDays} || ' days')::interval
      `.execute(db);

      return result.rows.map(
        (r): AlertFinding => ({
          ruleKey: 'care_gap_hba1c_overdue',
          dedupeKey: r.patient_id,
          severity: 'warning',
          title: 'HbA1c overdue for an active diabetic patient',
          detail: { patientId: r.patient_id, measure: 'hba1c', lookbackDays: options.lookbackDays, lastValueAt: r.last_value_at },
          tenantId: r.tenant_id,
        }),
      );
    },
  };
}
