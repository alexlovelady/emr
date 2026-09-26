import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(200),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
