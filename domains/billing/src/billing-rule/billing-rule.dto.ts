import { z } from 'zod';

const CodeRequiresDiagnosisPrefixParams = z.object({
  code: z.string().min(1).max(20),
  diagnosisPrefix: z.string().min(1).max(20),
});

const CodeForbiddenForSexParams = z.object({
  code: z.string().min(1).max(20),
  sex: z.enum(['M', 'F']),
});

const CodeMaxUnitsParams = z.object({
  code: z.string().min(1).max(20),
  maxUnits: z.number().int().positive(),
});

/**
 * A fixed catalog of rule types (see migration 0044's doc comment for why this isn't a free-form
 * rule DSL) — each discriminated by `ruleType`, with its own `parameters` shape enforced by Zod.
 */
export const CreateBillingRuleSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('code_requires_diagnosis_prefix'), description: z.string().min(1).max(300), parameters: CodeRequiresDiagnosisPrefixParams }),
  z.object({ ruleType: z.literal('code_forbidden_for_sex'), description: z.string().min(1).max(300), parameters: CodeForbiddenForSexParams }),
  z.object({ ruleType: z.literal('code_max_units'), description: z.string().min(1).max(300), parameters: CodeMaxUnitsParams }),
]);
export type CreateBillingRuleInput = z.infer<typeof CreateBillingRuleSchema>;

export const UpdateBillingRuleStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});
export type UpdateBillingRuleStatusInput = z.infer<typeof UpdateBillingRuleStatusSchema>;
