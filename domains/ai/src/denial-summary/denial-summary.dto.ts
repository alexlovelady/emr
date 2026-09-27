import { z } from 'zod';

export const DenialSummarySchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type DenialSummaryInput = z.infer<typeof DenialSummarySchema>;
