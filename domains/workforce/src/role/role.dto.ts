import { z } from 'zod';

export const AssignRoleSchema = z.object({
  roleKey: z.string().min(1).max(100),
});
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;

export const CreateRoleSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase letters, digits, and underscores only'),
  displayName: z.string().min(1).max(200),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const GrantPermissionSchema = z.object({
  permissionKey: z.string().min(1).max(100),
});
export type GrantPermissionInput = z.infer<typeof GrantPermissionSchema>;
