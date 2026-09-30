import { z } from 'zod';

/**
 * EHR_BUILD_SPEC.md §8.3's versioned cohort DSL. The original shape supported only what the
 * spec's own worked example showed: one `field` (`age`), three `concept`s (`condition`/`allergy`/
 * `medication`, code-prefix matched), and two named `measure`s (`latest_hba1c`/
 * `days_since_completed_encounter`). Item 1 of the Epic-parity build-out ("self-service population
 * explorer") extended this additively — every original condition shape still parses and compiles
 * identically, so every previously-saved `cohorts.dsl_payload` keeps working — with four more
 * `concept`s (`encounter`/`appointment`/`coverage`/`note`, existence-style matches, not
 * code-prefix) and one generalized `measure` (`latest_observation_value`, any LOINC code, replacing
 * the old hardcoded-to-HbA1c-only limitation while keeping `latest_hba1c` itself valid for
 * backward compatibility). See cohort-compiler.ts's registry for how each resolves to SQL.
 * Unknown identifiers fail validation here, before the compiler ever runs.
 */
const FieldConditionSchema = z.object({
  field: z.literal('age'),
  op: z.enum(['eq', 'gt', 'gte', 'lt', 'lte', 'between']),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
});

const ConceptConditionSchema = z.object({
  concept: z.enum(['condition', 'allergy', 'medication', 'encounter', 'appointment', 'coverage', 'note']),
  /** Only meaningful for `condition` (a coding system like ICD-10-CM) — every other concept
   * ignores it; kept as one shared optional field rather than a discriminated union per concept,
   * since the DSL is meant to stay a flat, easy-to-hand-author JSON shape. */
  system: z.string().max(50).nullish(),
  op: z.enum(['active', 'resolved', 'has_code', 'has_type', 'has_status', 'has_payer']),
  value: z.string().min(1).max(50),
});

const HbA1cMeasureSchema = z.object({
  measure: z.literal('latest_hba1c'),
  op: z.enum(['>', '<', '>=', '<=', '=']),
  value: z.number(),
});
const EncounterRecencyMeasureSchema = z.object({
  measure: z.literal('days_since_completed_encounter'),
  op: z.enum(['>', '<', '>=', '<=', '=']),
  value: z.number(),
});
/** Generalizes `latest_hba1c` to any LOINC-coded lab observation — `latest_hba1c` itself stays a
 * valid, separately-recognized measure (never removed) so no previously-saved cohort breaks. */
const ObservationValueMeasureSchema = z.object({
  measure: z.literal('latest_observation_value'),
  code: z.string().min(1).max(50),
  op: z.enum(['>', '<', '>=', '<=', '=']),
  value: z.number(),
});
const MeasureConditionSchema = z.discriminatedUnion('measure', [
  HbA1cMeasureSchema,
  EncounterRecencyMeasureSchema,
  ObservationValueMeasureSchema,
]);

export const CohortConditionSchema = z.union([FieldConditionSchema, ConceptConditionSchema, MeasureConditionSchema]);
export type CohortCondition = z.infer<typeof CohortConditionSchema>;

export const CohortDslSchema = z.object({
  version: z.literal(1),
  entity: z.literal('patient'),
  where: z.object({
    all: z.array(CohortConditionSchema).min(1).max(20),
  }),
});
export type CohortDsl = z.infer<typeof CohortDslSchema>;

export const SaveCohortSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  dsl: CohortDslSchema,
});
export type SaveCohortInput = z.infer<typeof SaveCohortSchema>;

export const ExecuteAdHocCohortSchema = z.object({
  dsl: CohortDslSchema,
});
export type ExecuteAdHocCohortInput = z.infer<typeof ExecuteAdHocCohortSchema>;

/** A live, unpersisted count preview as a filter set is being edited — same DSL, same compiler,
 * but never written to `cohort_executions` (no audit-log row per keystroke) and never exposes a
 * patient-id list, only the count. */
export const PreviewCohortSchema = z.object({
  dsl: CohortDslSchema,
});
export type PreviewCohortInput = z.infer<typeof PreviewCohortSchema>;

/**
 * Item 1's "slice" capability (Epic SlicerDicer-equivalent): breaks the SAME matched population
 * down by one safe, fixed dimension — deliberately a closed enum, not an arbitrary column name,
 * so this can never become a raw-SQL-injection surface or leak an unreviewed column. Always
 * returns aggregate bucket counts, never patient-level rows — the same minimum-necessary posture
 * `compileAndRun`'s own doc comment describes for ordinary execution.
 */
export const BreakdownDimensionSchema = z.enum(['sex_at_birth', 'age_bucket', 'active_condition_code']);
export type BreakdownDimension = z.infer<typeof BreakdownDimensionSchema>;

export const ExecuteBreakdownSchema = z.object({
  dsl: CohortDslSchema,
  groupBy: BreakdownDimensionSchema,
});
export type ExecuteBreakdownInput = z.infer<typeof ExecuteBreakdownSchema>;
