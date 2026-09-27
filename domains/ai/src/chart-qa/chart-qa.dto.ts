import { z } from 'zod';

export const ChartQaSchema = z.object({
  question: z.string().min(1).max(2000),
});
export type ChartQaInput = z.infer<typeof ChartQaSchema>;
