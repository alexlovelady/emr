import { z } from 'zod';

export const CreateObservationSchema = z
  .object({
    category: z.string().min(1).max(50).default('vital-signs'),
    code: z.string().min(1).max(100),
    displayName: z.string().min(1).max(300),
    valueQuantity: z.number().nullish(),
    valueText: z.string().max(1000).nullish(),
    unit: z.string().max(50).nullish(),
  })
  .refine((v) => v.valueQuantity != null || v.valueText != null, {
    message: 'Either valueQuantity or valueText must be provided',
  });
export type CreateObservationInput = z.infer<typeof CreateObservationSchema>;
