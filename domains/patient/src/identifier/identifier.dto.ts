import { z } from 'zod';

export const CreatePatientIdentifierSchema = z.object({
  organizationId: z.string().uuid().nullish(),
  identifierSystem: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  isPrimary: z.boolean().default(false),
});
export type CreatePatientIdentifierInput = z.infer<typeof CreatePatientIdentifierSchema>;
