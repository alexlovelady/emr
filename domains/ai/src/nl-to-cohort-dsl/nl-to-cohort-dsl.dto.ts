import { z } from 'zod';

export const ProposeCohortDslSchema = z.object({
  question: z.string().min(1).max(2000),
});
export type ProposeCohortDslInput = z.infer<typeof ProposeCohortDslSchema>;

export const ExecuteCohortDslSchema = z.object({
  editedDsl: z.record(z.string(), z.unknown()).nullish(),
});
export type ExecuteCohortDslInput = z.infer<typeof ExecuteCohortDslSchema>;
