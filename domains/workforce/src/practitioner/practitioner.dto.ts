import { z } from 'zod';

export const CreatePractitionerSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  displayName: z.string().min(1).max(300),
  npi: z.string().regex(/^\d{10}$/).nullish(),
  taxonomyCode: z.string().max(50).nullish(),
});
export type CreatePractitionerInput = z.infer<typeof CreatePractitionerSchema>;
