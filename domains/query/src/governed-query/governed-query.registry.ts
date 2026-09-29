import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { z } from 'zod';

type Executor = Kysely<DB> | Transaction<DB>;

export interface GovernedQueryDefinition {
  description: string;
  paramsSchema: z.ZodTypeAny;
  run(trx: Executor, tenantId: string, params: Record<string, unknown>): Promise<unknown>;
}

const PatientCountByActiveProblemParams = z.object({
  codeSystem: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
});

const EncountersByMonthParams = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const ClaimsStatusBreakdownParams = z.object({});

const PayerPerformanceSummaryParams = z.object({
  submittedAfter: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

const RemittanceTrendsByMonthParams = z.object({
  payerName: z.string().min(1).max(200).nullish(),
});

const QualityMeasureDiabetesHba1cControlParams = z.object({});

const QualityMeasureAnnualWellnessVisitParams = z.object({
  /** Encounters more than this many days ago don't count toward "had a visit this period." */
  lookbackDays: z.number().int().min(1).max(1000).default(365),
});

const AiGenerationQualityByFeatureParams = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/** LOINC code for Hemoglobin A1c — same code the cohort compiler's `latest_hba1c` measure uses. */
const HBA1C_LOINC_CODE = '4548-4';

/**
 * EHR_BUILD_SPEC.md §8.3: "Do not expose unrestricted SQL to normal customers." This is the
 * "governed SQL for internal analysts" bullet's real form — a fixed, in-code catalog of
 * pre-built, parameterized, read-only queries, each with its own Zod param schema, rather than a
 * SQL parser/executor (a genuine injection surface a casual implementation would introduce).
 * Every query is tenant-scoped internally; callers never supply raw SQL or table/column names.
 */
export const GOVERNED_QUERIES: Record<string, GovernedQueryDefinition> = {
  patient_count_by_active_problem: {
    description: 'Count of distinct patients with an active problem matching a code system + code prefix.',
    paramsSchema: PatientCountByActiveProblemParams,
    async run(trx, tenantId, rawParams) {
      const params = PatientCountByActiveProblemParams.parse(rawParams);
      const result = await sql<{ count: string }>`
        select count(distinct pr.patient_id) as count
        from problems pr
        where pr.tenant_id = ${tenantId}
          and pr.code_system = ${params.codeSystem}
          and pr.code like ${params.code + '%'}
          and pr.clinical_status = 'active'
      `.execute(trx);
      return { count: Number(result.rows[0]?.count ?? 0) };
    },
  },
  encounters_by_month: {
    description: 'Encounter counts grouped by month, within a date range.',
    paramsSchema: EncountersByMonthParams,
    async run(trx, tenantId, rawParams) {
      const params = EncountersByMonthParams.parse(rawParams);
      const result = await sql<{ month: string; count: string }>`
        select to_char(date_trunc('month', started_at), 'YYYY-MM') as month, count(*) as count
        from encounters
        where tenant_id = ${tenantId}
          and started_at >= ${params.startDate}::date
          and started_at < (${params.endDate}::date + interval '1 day')
        group by 1
        order by 1
      `.execute(trx);
      return result.rows.map((r) => ({ month: r.month, count: Number(r.count) }));
    },
  },
  claims_status_breakdown: {
    description: 'Claim counts grouped by current status.',
    paramsSchema: ClaimsStatusBreakdownParams,
    async run(trx, tenantId) {
      const result = await sql<{ status: string; count: string }>`
        select status, count(*) as count
        from claims
        where tenant_id = ${tenantId}
        group by status
        order by status
      `.execute(trx);
      return result.rows.map((r) => ({ status: r.status, count: Number(r.count) }));
    },
  },
  payer_performance_summary: {
    description: 'Per-payer claim volume, denial rate, total paid, and average days-to-payment (Athelas RCM parity item 6).',
    paramsSchema: PayerPerformanceSummaryParams,
    async run(trx, tenantId, rawParams) {
      const params = PayerPerformanceSummaryParams.parse(rawParams);
      const result = await sql<{
        payer_name: string;
        claims_total: string;
        claims_submitted: string;
        claims_paid: string;
        claims_denied: string;
        total_paid_amount: string;
        avg_days_to_payment: string | null;
      }>`
        with claim_payer as (
          select c.id as claim_id, coalesce(cov.payer_name, '(self-pay / no coverage)') as payer_name
          from claims c
          left join coverages cov on cov.id = c.coverage_id and cov.tenant_id = c.tenant_id
          where c.tenant_id = ${tenantId}
        ),
        first_submitted as (
          select claim_id, min(submitted_at) as submitted_at
          from claim_versions
          where tenant_id = ${tenantId} and version_status = 'submitted'
          group by claim_id
        ),
        first_paid as (
          select claim_id, min(posted_at) as posted_at, sum(payer_paid_amount) as total_paid
          from remittances
          where tenant_id = ${tenantId}
          group by claim_id
        ),
        denied_claims as (
          select distinct claim_id from denials where tenant_id = ${tenantId}
        )
        select
          cp.payer_name,
          count(*) as claims_total,
          count(fs.claim_id) as claims_submitted,
          count(fp.claim_id) as claims_paid,
          count(dc.claim_id) as claims_denied,
          coalesce(sum(fp.total_paid), 0) as total_paid_amount,
          avg(extract(epoch from (fp.posted_at - fs.submitted_at)) / 86400)
            filter (where fp.posted_at is not null and fs.submitted_at is not null) as avg_days_to_payment
        from claim_payer cp
        left join first_submitted fs on fs.claim_id = cp.claim_id
        left join first_paid fp on fp.claim_id = cp.claim_id
        left join denied_claims dc on dc.claim_id = cp.claim_id
        ${params.submittedAfter ? sql`where fs.submitted_at >= ${params.submittedAfter}::date` : sql``}
        group by cp.payer_name
        order by claims_total desc
      `.execute(trx);
      return result.rows.map((r) => ({
        payerName: r.payer_name,
        claimsTotal: Number(r.claims_total),
        claimsSubmitted: Number(r.claims_submitted),
        claimsPaid: Number(r.claims_paid),
        claimsDenied: Number(r.claims_denied),
        totalPaidAmount: Number(r.total_paid_amount),
        avgDaysToPayment: r.avg_days_to_payment === null ? null : Number(r.avg_days_to_payment),
      }));
    },
  },
  remittance_trends_by_month: {
    description: 'Monthly 835 remittance trends — paid/adjustment/patient-responsibility totals, optionally filtered to one payer (Athelas RCM parity item 8).',
    paramsSchema: RemittanceTrendsByMonthParams,
    async run(trx, tenantId, rawParams) {
      const params = RemittanceTrendsByMonthParams.parse(rawParams);
      const result = await sql<{
        month: string;
        claims_count: string;
        total_paid_amount: string;
        total_adjustment_amount: string;
        total_patient_responsibility_amount: string;
      }>`
        select
          to_char(date_trunc('month', r.posted_at), 'YYYY-MM') as month,
          count(distinct r.claim_id) as claims_count,
          sum(r.payer_paid_amount) as total_paid_amount,
          sum(r.adjustment_amount) as total_adjustment_amount,
          sum(r.patient_responsibility_amount) as total_patient_responsibility_amount
        from remittances r
        left join claims c on c.id = r.claim_id and c.tenant_id = r.tenant_id
        left join coverages cov on cov.id = c.coverage_id and cov.tenant_id = c.tenant_id
        where r.tenant_id = ${tenantId}
        ${params.payerName ? sql`and cov.payer_name = ${params.payerName}` : sql``}
        group by 1
        order by 1
      `.execute(trx);
      return result.rows.map((r) => ({
        month: r.month,
        claimsCount: Number(r.claims_count),
        totalPaidAmount: Number(r.total_paid_amount),
        totalAdjustmentAmount: Number(r.total_adjustment_amount),
        totalPatientResponsibilityAmount: Number(r.total_patient_responsibility_amount),
      }));
    },
  },
  /**
   * Tier 2 platform gap: population health / quality measures. Deliberately scoped down to 2 real,
   * fixed measures rather than a general MIPS/HEDIS calculation engine (same "scope down first"
   * discipline used for the billing-rules engine) — each is a simplified proxy for a real,
   * well-known measure concept, not the certified NCQA/CMS specification (no age bands, exclusions,
   * or multi-year lookback logic). Denominator/numerator/rate is the same shape a real quality
   * measure reports in.
   */
  quality_measure_diabetes_hba1c_control: {
    description:
      'Simplified proxy for HEDIS "Hemoglobin A1c Control (<8%)": of active patients with an active diabetes diagnosis, what share\'s most recent HbA1c is under 8%.',
    paramsSchema: QualityMeasureDiabetesHba1cControlParams,
    async run(trx, tenantId) {
      const result = await sql<{ denominator: string; numerator: string; no_recent_result: string }>`
        with diabetic_patients as (
          select distinct pr.patient_id
          from problems pr
          join patients p on p.id = pr.patient_id and p.tenant_id = pr.tenant_id
          where pr.tenant_id = ${tenantId}
            and pr.code_system = 'ICD-10' and pr.code like 'E11%'
            and pr.clinical_status = 'active'
            and p.status = 'active'
        ),
        latest_hba1c as (
          select distinct on (o.patient_id) o.patient_id, o.value_quantity::numeric as value
          from observations o
          where o.tenant_id = ${tenantId}
            and o.code = ${HBA1C_LOINC_CODE} and o.category = 'laboratory' and o.value_quantity is not null
            and o.patient_id in (select patient_id from diabetic_patients)
          order by o.patient_id, o.effective_at desc
        )
        select
          (select count(*) from diabetic_patients) as denominator,
          (select count(*) from latest_hba1c where value < 8.0) as numerator,
          (select count(*) from diabetic_patients dp where not exists (select 1 from latest_hba1c h where h.patient_id = dp.patient_id)) as no_recent_result
      `.execute(trx);
      const row = result.rows[0]!;
      const denominator = Number(row.denominator);
      const numerator = Number(row.numerator);
      return {
        denominator,
        numerator,
        rate: denominator === 0 ? null : numerator / denominator,
        patientsWithNoRecentHba1c: Number(row.no_recent_result),
      };
    },
  },
  quality_measure_annual_wellness_visit: {
    description: 'Simplified proxy for an annual wellness/well-care visit measure: of active patients, what share had a completed encounter within the lookback window.',
    paramsSchema: QualityMeasureAnnualWellnessVisitParams,
    async run(trx, tenantId, rawParams) {
      const params = QualityMeasureAnnualWellnessVisitParams.parse(rawParams);
      const result = await sql<{ denominator: string; numerator: string }>`
        with active_patients as (
          select id as patient_id from patients where tenant_id = ${tenantId} and status = 'active'
        )
        select
          (select count(*) from active_patients) as denominator,
          (select count(distinct e.patient_id) from encounters e
            where e.tenant_id = ${tenantId} and e.ended_at is not null
              and e.ended_at >= now() - (${params.lookbackDays} || ' days')::interval
              and e.patient_id in (select patient_id from active_patients)
          ) as numerator
      `.execute(trx);
      const row = result.rows[0]!;
      const denominator = Number(row.denominator);
      const numerator = Number(row.numerator);
      return { denominator, numerator, rate: denominator === 0 ? null : numerator / denominator, lookbackDays: params.lookbackDays };
    },
  },
  /**
   * The AI eval/quality telemetry harness this repo never had: `ai_generations.status` (set only
   * by a human reviewer via AiGenerationService.accept()/reject()) is the one real signal this
   * system has for "was this output actually good" — no LLM vendor exists to score outputs itself
   * (docs/adr/0004-deferred-ai-vendor.md), so human accept/edit/reject decisions are the ground
   * truth. `accepted_with_edits` + `rejected` as a share of reviewed generations is a real, if
   * rough, hallucination/quality-issue proxy: it's exactly the rate at which a clinician had to
   * catch and fix or throw out what the model produced, per feature and per prompt template
   * version — the natural axis for spotting a regression after a prompt change.
   */
  ai_generation_quality_by_feature: {
    description:
      'Per-feature/prompt-template AI generation outcomes (accepted/edited/rejected/pending) and derived rates — the human-review signal stands in for a real eval harness (no LLM vendor is connected to score outputs itself).',
    paramsSchema: AiGenerationQualityByFeatureParams,
    async run(trx, tenantId, rawParams) {
      const params = AiGenerationQualityByFeatureParams.parse(rawParams);
      const sinceFilter = params.since ? sql`and created_at >= ${new Date(params.since)}` : sql``;
      const result = await sql<{
        feature: string;
        prompt_template_version: string;
        total: string;
        accepted: string;
        accepted_with_edits: string;
        rejected: string;
        pending: string;
      }>`
        select
          feature,
          prompt_template_version,
          count(*) as total,
          count(*) filter (where status = 'accepted') as accepted,
          count(*) filter (where status = 'accepted_with_edits') as accepted_with_edits,
          count(*) filter (where status = 'rejected') as rejected,
          count(*) filter (where status = 'pending') as pending
        from ai_generations
        where tenant_id = ${tenantId}
        ${sinceFilter}
        group by feature, prompt_template_version
      `.execute(trx);

      return result.rows
        .map((r) => {
          const total = Number(r.total);
          const accepted = Number(r.accepted);
          const acceptedWithEdits = Number(r.accepted_with_edits);
          const rejected = Number(r.rejected);
          const pending = Number(r.pending);
          const reviewed = accepted + acceptedWithEdits + rejected;
          return {
            feature: r.feature,
            promptTemplateVersion: r.prompt_template_version,
            total,
            accepted,
            acceptedWithEdits,
            rejected,
            pending,
            reviewed,
            acceptanceRate: reviewed === 0 ? null : accepted / reviewed,
            correctionRate: reviewed === 0 ? null : (acceptedWithEdits + rejected) / reviewed,
          };
        })
        .sort((a, b) => a.feature.localeCompare(b.feature) || a.promptTemplateVersion.localeCompare(b.promptTemplateVersion));
    },
  },
};
