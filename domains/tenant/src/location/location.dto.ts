import { z } from 'zod';

export const CreateLocationSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(300),
  timeZone: z.string().min(1).max(100).optional(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(50).nullish(),
  postalCode: z.string().max(20).nullish(),
});
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;

export const UpdateLocationSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  timeZone: z.string().min(1).max(100).optional(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(50).nullish(),
  postalCode: z.string().max(20).nullish(),
});
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
