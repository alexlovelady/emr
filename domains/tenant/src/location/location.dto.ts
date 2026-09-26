import { z } from 'zod';

export const CreateLocationSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(300),
  timeZone: z.string().min(1).max(100).optional(),
});
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
