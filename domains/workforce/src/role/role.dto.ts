import { z } from 'zod';

export const AssignRoleSchema = z.object({
  roleKey: z.string().min(1).max(100),
});
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
