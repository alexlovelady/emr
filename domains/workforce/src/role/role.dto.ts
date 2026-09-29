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

/** Custom (non-system) roles only — see RoleService.updateRole()'s isSystem guard. */
export const UpdateRoleSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase letters, digits, and underscores only')
    .optional(),
  displayName: z.string().min(1).max(200).optional(),
});
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const GrantPermissionSchema = z.object({
  permissionKey: z.string().min(1).max(100),
});
export type GrantPermissionInput = z.infer<typeof GrantPermissionSchema>;

export const ListUserRoleGrantsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ListUserRoleGrantsInput = z.infer<typeof ListUserRoleGrantsSchema>;
