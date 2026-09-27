import { z } from 'zod';

export const EncounterSummarySchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type EncounterSummaryInput = z.infer<typeof EncounterSummarySchema>;
