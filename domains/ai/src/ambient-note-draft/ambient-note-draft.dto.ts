import { z } from 'zod';

export const AmbientNoteDraftSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type AmbientNoteDraftInput = z.infer<typeof AmbientNoteDraftSchema>;
