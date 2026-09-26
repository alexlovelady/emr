import { z } from 'zod';

export const ResolveDenialSchema = z.object({
  resolutionNotes: z.string().min(1).max(2000),
});
export type ResolveDenialInput = z.infer<typeof ResolveDenialSchema>;
