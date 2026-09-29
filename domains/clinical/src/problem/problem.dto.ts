import { z } from 'zod';

/** Item 22 layer 5's tag mechanism — see migration `0055_problems_sensitivity.ts`'s doc comment
 * for why this is a plain tag, not real per-category legal handling. */
export const PROBLEM_SENSITIVITY_CATEGORIES = ['behavioral_health', 'substance_use', 'reproductive_health', 'hiv_status', 'other'] as const;

export const CreateProblemSchema = z.object({
  encounterId: z.string().uuid().nullish(),
  codeSystem: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  displayName: z.string().min(1).max(300),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
  sensitivity: z.enum(PROBLEM_SENSITIVITY_CATEGORIES).nullish(),
});
export type CreateProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemStatusSchema = z.object({
  clinicalStatus: z.enum(['active', 'resolved', 'inactive']),
});
export type UpdateProblemStatusInput = z.infer<typeof UpdateProblemStatusSchema>;
