import { z } from 'zod';

export const CreateEligibilityCheckSchema = z.object({
  coverageId: z.string().uuid(),
});
export type CreateEligibilityCheckInput = z.infer<typeof CreateEligibilityCheckSchema>;
