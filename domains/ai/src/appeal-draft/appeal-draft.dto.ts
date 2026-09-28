import { z } from 'zod';

export const AppealDraftSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type AppealDraftInput = z.infer<typeof AppealDraftSchema>;
