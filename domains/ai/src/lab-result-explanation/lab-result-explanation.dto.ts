import { z } from 'zod';

export const LabResultExplanationSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type LabResultExplanationInput = z.infer<typeof LabResultExplanationSchema>;
