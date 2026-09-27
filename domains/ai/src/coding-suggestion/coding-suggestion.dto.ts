import { z } from 'zod';

export const CodingSuggestionSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type CodingSuggestionInput = z.infer<typeof CodingSuggestionSchema>;
