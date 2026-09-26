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
};
