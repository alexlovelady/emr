import { z } from 'zod';

/**
 * EHR_BUILD_SPEC.md §8.3's versioned cohort DSL, implemented literally. Only what the spec's own
 * worked example shows is supported: one `field` (`age`), three `concept`s (`condition`/
 * `allergy`/`medication`, code-prefix matched), and the two named `measure`s
 * (`latest_hba1c`/`days_since_completed_encounter`) — see cohort-compiler.ts's registry for how
 * each resolves to SQL. Unknown identifiers fail validation here, before the compiler ever runs.
 */
const FieldConditionSchema = z.object({
  field: z.literal('age'),
  op: z.enum(['eq', 'gt', 'gte', 'lt', 'lte', 'between']),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
});

const ConceptConditionSchema = z.object({
  concept: z.enum(['condition', 'allergy', 'medication']),
  system: z.string().min(1).max(50),
  op: z.enum(['active', 'resolved', 'has_code']),
  value: z.string().min(1).max(50),
});

const MeasureConditionSchema = z.object({
  measure: z.enum(['latest_hba1c', 'days_since_completed_encounter']),
  op: z.enum(['>', '<', '>=', '<=', '=']),
  value: z.number(),
});

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
