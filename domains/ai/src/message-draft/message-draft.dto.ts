import { z } from 'zod';

export const MessageDraftSchema = z.object({
  instructions: z.string().max(2000).nullish(),
});
export type MessageDraftInput = z.infer<typeof MessageDraftSchema>;
