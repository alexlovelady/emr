import { z } from 'zod';

export const CreateAllergySchema = z.object({
  encounterId: z.string().uuid().nullish(),
  substance: z.string().min(1).max(300),
  reaction: z.string().max(500).nullish(),
  severity: z.enum(['mild', 'moderate', 'severe']).nullish(),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});
export type CreateAllergyInput = z.infer<typeof CreateAllergySchema>;
