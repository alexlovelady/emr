import { z } from 'zod';

export const CreateMedicationSchema = z.object({
  encounterId: z.string().uuid().nullish(),
  medicationName: z.string().min(1).max(300),
  rxnormCode: z.string().max(50).nullish(),
  dose: z.string().max(100).nullish(),
  route: z.string().max(100).nullish(),
  frequency: z.string().max(100).nullish(),
  sourceType: z.enum(['patient_reported', 'clinician_entered', 'external_import']),
  startedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  prescriberId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
});
export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;

export const DiscontinueMedicationSchema = z.object({
  stoppedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});
export type DiscontinueMedicationInput = z.infer<typeof DiscontinueMedicationSchema>;
