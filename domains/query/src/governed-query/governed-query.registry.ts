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
};
