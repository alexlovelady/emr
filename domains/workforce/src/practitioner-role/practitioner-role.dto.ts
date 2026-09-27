import { z } from 'zod';

export const CreatePractitionerRoleSchema = z.object({
  locationId: z.string().uuid(),
  roleId: z.string().uuid(),
  effectiveStart: z.string().datetime().optional(),
  effectiveEnd: z.string().datetime().nullish(),
});
export type CreatePractitionerRoleInput = z.infer<typeof CreatePractitionerRoleSchema>;
