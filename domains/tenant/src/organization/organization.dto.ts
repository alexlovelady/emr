import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(300),
  npi: z.string().regex(/^\d{10}$/).nullish(),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  npi: z.string().regex(/^\d{10}$/).nullish(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
