import { z } from 'zod';

export const CreateClaimSchema = z.object({
  encounterId: z.string().uuid(),
  billingPractitionerId: z.string().uuid(),
  coverageId: z.string().uuid().nullish(),
  chargeIds: z.array(z.string().uuid()).min(1),
});
export type CreateClaimInput = z.infer<typeof CreateClaimSchema>;
