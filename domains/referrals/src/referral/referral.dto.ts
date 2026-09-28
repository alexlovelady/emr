import { z } from 'zod';

export const CreateReferralSchema = z.object({
  referringPractitionerId: z.string().uuid(),
  referredToPractitionerId: z.string().uuid().nullish(),
  externalProviderName: z.string().min(1).max(300).nullish(),
  specialty: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
  urgency: z.enum(['routine', 'urgent', 'stat']).default('routine'),
});
export type CreateReferralInput = z.infer<typeof CreateReferralSchema>;

export const UpdateReferralStatusSchema = z.object({
  status: z.enum(['sent', 'scheduled', 'completed', 'declined', 'cancelled']),
  notes: z.string().min(1).max(2000).nullish(),
});
export type UpdateReferralStatusInput = z.infer<typeof UpdateReferralStatusSchema>;
