import { z } from 'zod';

export const CreateChargeSchema = z.object({
  encounterId: z.string().uuid(),
  billingPractitionerId: z.string().uuid(),
  codeSystem: z.enum(['CPT', 'HCPCS']),
  code: z.string().min(1).max(20),
  description: z.string().min(1).max(300),
  units: z.number().int().positive().default(1),
  unitPrice: z.number().positive(),
  diagnosisCodes: z.array(z.string().min(1).max(20)).default([]),
});
export type CreateChargeInput = z.infer<typeof CreateChargeSchema>;

export const FinalizeChargeCodingSchema = z.object({
  codeSystem: z.enum(['CPT', 'HCPCS']).nullish(),
  code: z.string().min(1).max(20).nullish(),
  description: z.string().min(1).max(300).nullish(),
  diagnosisCodes: z.array(z.string().min(1).max(20)).nullish(),
});
export type FinalizeChargeCodingInput = z.infer<typeof FinalizeChargeCodingSchema>;
