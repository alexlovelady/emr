import { z } from 'zod';

export const CreateSpecimenSchema = z.object({
  specimenType: z.string().min(1).max(100),
  accessionNumber: z.string().max(100).nullish(),
});
export type CreateSpecimenInput = z.infer<typeof CreateSpecimenSchema>;
