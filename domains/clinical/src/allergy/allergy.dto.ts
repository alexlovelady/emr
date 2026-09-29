import { z } from 'zod';

export const CreateAllergySchema = z.object({
  encounterId: z.string().uuid().nullish(),
  substance: z.string().min(1).max(300),
  /** Optional coded value (e.g. RxNorm for a drug allergy) — most allergy entries are still pure
   * free text; this lets a caller who has a real code attach one without requiring it universally. */
  codeSystem: z.string().max(50).nullish(),
  code: z.string().max(50).nullish(),
  reaction: z.string().max(500).nullish(),
  severity: z.enum(['mild', 'moderate', 'severe']).nullish(),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});
export type CreateAllergyInput = z.infer<typeof CreateAllergySchema>;

export const UpdateAllergySchema = z.object({
  reaction: z.string().max(500).nullish(),
  severity: z.enum(['mild', 'moderate', 'severe']).nullish(),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});
export type UpdateAllergyInput = z.infer<typeof UpdateAllergySchema>;
