import { sql, type Kysely, type RawBuilder, type Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ValidationError } from '@ehr/domain-common';
import type { BreakdownDimension, CohortCondition, CohortDsl } from './cohort.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface CohortCompileResult {
  patientIds: string[];
  resultCount: number;
  estimatedRows: number | null;
  asOf: Date;
  truncated: boolean;
}

/** Population queries return the population, not a data dump (spec's minimum-necessary instinct). */
const MAX_RESULTS = 5000;

const COMPARATORS: Record<string, string> = {
  eq: '=',
  '=': '=',
  gt: '>',
  '>': '>',
  gte: '>=',
  '>=': '>=',
  lt: '<',
  '<': '<',
  lte: '<=',
  '<=': '<=',
};

/** LOINC code for Hemoglobin A1c, matching spec §8.3's own `latest_hba1c` example literally. */
const HBA1C_LOINC_CODE = '4548-4';

/**
 * EHR_BUILD_SPEC.md §8.3's query compiler, step 1 ("resolve semantic fields to approved models"):
 * every condition kind is resolved against this small, explicit registry — an unrecognized field/
 * concept/measure is rejected by `CohortDslSchema` before compilation (Zod's discriminated enums),
 * so this function only ever sees already-validated identifiers.
 */
function compileCondition(condition: CohortCondition): RawBuilder<unknown> {
  if ('field' in condition) {
    // Only `age` is registered (spec's own example) — the DTO enum guarantees this branch is exhaustive.
    if (Array.isArray(condition.value)) {
      const [lo, hi] = condition.value;
      return sql`extract(year from age(current_date, p.date_of_birth)) between ${lo} and ${hi}`;
    }
    const comparator = COMPARATORS[condition.op];
    if (!comparator) throw new ValidationError(`Unsupported operator for field 'age': ${condition.op}`);
    return sql`extract(year from age(current_date, p.date_of_birth)) ${sql.raw(comparator)} ${condition.value}`;
  }

  if ('concept' in condition) {
    if (condition.concept === 'condition') {
      const statusClause =
        condition.op === 'active'
          ? sql`and pr.clinical_status = 'active'`
          : condition.op === 'resolved'
            ? sql`and pr.clinical_status = 'resolved'`
            : sql``;
      return sql`exists (
        select 1 from problems pr
        where pr.tenant_id = p.tenant_id and pr.patient_id = p.id
          and pr.code_system = ${condition.system} and pr.code like ${condition.value + '%'}
          ${statusClause}
      )`;
    }
    if (condition.concept === 'allergy') {
      const statusClause = condition.op === 'active' ? sql`and al.status = 'active'` : sql``;
      return sql`exists (
        select 1 from allergies al
        where al.tenant_id = p.tenant_id and al.patient_id = p.id
          and al.substance ilike ${'%' + condition.value + '%'}
          ${statusClause}
      )`;
    }
    if (condition.concept === 'medication') {
      // matched against rxnorm_code; `system` is accepted but unused since this schema only ever
      // stores an RxNorm code, no separate coding-system column.
      const activeClause =
        condition.op === 'active' ? sql`and m.stopped_at is null` : condition.op === 'resolved' ? sql`and m.stopped_at is not null` : sql``;
      return sql`exists (
        select 1 from medications m
        where m.tenant_id = p.tenant_id and m.patient_id = p.id
          and m.rxnorm_code = ${condition.value}
          ${activeClause}
      )`;
    }
    if (condition.concept === 'encounter') {
      return sql`exists (
        select 1 from encounters e
        where e.tenant_id = p.tenant_id and e.patient_id = p.id and e.encounter_type = ${condition.value}
      )`;
    }
    if (condition.concept === 'appointment') {
      return sql`exists (
        select 1 from appointments a
        where a.tenant_id = p.tenant_id and a.patient_id = p.id and a.status = ${condition.value}
      )`;
    }
    if (condition.concept === 'coverage') {
      return sql`exists (
        select 1 from coverages c
        where c.tenant_id = p.tenant_id and c.patient_id = p.id and c.status = 'active'
          and c.payer_name ilike ${'%' + condition.value + '%'}
      )`;
    }
    // concept === 'note' — signed notes of the given type only; an unsigned draft never counts
    // toward a population definition.
    return sql`exists (
      select 1 from notes n
      where n.tenant_id = p.tenant_id and n.patient_id = p.id
        and n.note_type = ${condition.value} and n.signed_at is not null
    )`;
  }

  // measure
  const comparator = COMPARATORS[condition.op];
  if (!comparator) throw new ValidationError(`Unsupported operator for measure '${condition.measure}': ${condition.op}`);

  if (condition.measure === 'latest_hba1c' || condition.measure === 'latest_observation_value') {
    // `latest_hba1c` is `latest_observation_value` pinned to the HbA1c LOINC code — kept as its
    // own named measure for backward compatibility with any cohort saved before the generalized
    // form existed, rather than silently rewriting old DSL payloads on read.
    const code = condition.measure === 'latest_hba1c' ? HBA1C_LOINC_CODE : condition.code;
    return sql`(
      select o.value_quantity::numeric from observations o
      where o.tenant_id = p.tenant_id and o.patient_id = p.id
        and o.code = ${code} and o.category = 'laboratory' and o.value_quantity is not null
      order by o.effective_at desc
      limit 1
    ) ${sql.raw(comparator)} ${condition.value}`;
  }

  // measure === 'days_since_completed_encounter'
  return sql`extract(day from now() - (
    select max(e.ended_at) from encounters e
    where e.tenant_id = p.tenant_id and e.patient_id = p.id and e.ended_at is not null
  )) ${sql.raw(comparator)} ${condition.value}`;
}

/**
 * The rest of spec §8.3's 7-step pipeline (step 1, field resolution, already happened in
 * `CohortDslSchema`'s Zod validation before this runs): tenant-scope every subquery (every
 * `compileCondition` fragment above joins back to `p.tenant_id`), `EXPLAIN` for a real row
 * estimate, execute, cap results, and return a freshness timestamp. Persisting the execution
 * record is the caller's job (`cohort.service.ts`), since that also needs the executor's identity.
 */
export async function compileAndRun(trx: Executor, tenantId: string, dsl: CohortDsl): Promise<CohortCompileResult> {
  const conditions = dsl.where.all.map(compileCondition);
  const whereClause = sql.join(conditions, sql` and `);

  const explainResult = await sql<{ 'QUERY PLAN': [{ Plan: { 'Plan Rows'?: number } }] }>`
    explain (format json)
    select p.id from patients p where p.tenant_id = ${tenantId} and ${whereClause}
  `.execute(trx);
  const estimatedRows = explainResult.rows[0]?.['QUERY PLAN']?.[0]?.Plan?.['Plan Rows'] ?? null;

  const rows = await sql<{ id: string }>`
    select p.id from patients p where p.tenant_id = ${tenantId} and ${whereClause}
    order by p.id
    limit ${MAX_RESULTS + 1}
  `.execute(trx);

  const truncated = rows.rows.length > MAX_RESULTS;
  const patientIds = rows.rows.slice(0, MAX_RESULTS).map((r) => r.id);

  return {
    patientIds,
    resultCount: patientIds.length,
    estimatedRows,
    asOf: new Date(),
    truncated,
  };
}

export interface CohortBreakdownBucket {
  label: string;
  count: number;
}

export interface CohortBreakdownResult {
  buckets: CohortBreakdownBucket[];
  totalCount: number;
}

/**
 * Item 1's "slice" capability: the same matched population as `compileAndRun`, grouped by one
 * fixed, safe dimension and returned as aggregate counts only — never a patient-id list, matching
 * `compileAndRun`'s own minimum-necessary posture. `groupBy` is a closed enum validated by
 * `BreakdownDimensionSchema` before this ever runs, so there is no raw-column-name injection
 * surface here.
 */
export async function compileBreakdown(trx: Executor, tenantId: string, dsl: CohortDsl, groupBy: BreakdownDimension): Promise<CohortBreakdownResult> {
  const conditions = dsl.where.all.map(compileCondition);
  const whereClause = sql.join(conditions, sql` and `);

  let rows: { bucket: string; count: string | number }[];
  if (groupBy === 'sex_at_birth') {
    const result = await sql<{ bucket: string; count: string }>`
      select coalesce(p.sex_at_birth, 'unknown') as bucket, count(*) as count
      from patients p where p.tenant_id = ${tenantId} and ${whereClause}
      group by bucket order by count desc
    `.execute(trx);
    rows = result.rows;
  } else if (groupBy === 'age_bucket') {
    const result = await sql<{ bucket: string; count: string }>`
      select (floor(extract(year from age(current_date, p.date_of_birth)) / 10) * 10)::text || 's' as bucket, count(*) as count
      from patients p where p.tenant_id = ${tenantId} and ${whereClause}
      group by bucket order by bucket
    `.execute(trx);
    rows = result.rows;
  } else {
    // active_condition_code — a patient with multiple active problems under the same code is
    // still counted once per code (count distinct patient, not distinct problem row).
    const result = await sql<{ bucket: string; count: string }>`
      select pr.code_system || ':' || pr.code || ' ' || pr.display_name as bucket, count(distinct p.id) as count
      from patients p
      join problems pr on pr.tenant_id = p.tenant_id and pr.patient_id = p.id and pr.clinical_status = 'active'
      where p.tenant_id = ${tenantId} and ${whereClause}
      group by bucket order by count(distinct p.id) desc
      limit 10
    `.execute(trx);
    rows = result.rows;
  }

  const buckets = rows.map((r) => ({ label: r.bucket, count: Number(r.count) }));
  return { buckets, totalCount: buckets.reduce((sum, b) => sum + b.count, 0) };
}
