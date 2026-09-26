import { z } from 'zod';

export const CreateMessageThreadSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10_000),
});
export type CreateMessageThreadInput = z.infer<typeof CreateMessageThreadSchema>;

export const ReplyMessageSchema = z.object({
  body: z.string().min(1).max(10_000),
});
export type ReplyMessageInput = z.infer<typeof ReplyMessageSchema>;
