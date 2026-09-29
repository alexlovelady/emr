import { z } from 'zod';
import { validateDose } from '@ehr/dose-utils';

/**
 * Item 19's dose/unit structural sanity check — `dose` remains free text (no per-drug clinical
 * dosing database exists to validate against; see `packages/dose-utils`'s own doc comment for why
 * that's deliberately out of scope), but a value that isn't even a parseable "amount + recognized
 * unit" (a missing unit, a typo'd one, a non-numeric amount) is rejected here rather than silently
 * persisted. An implausibly large amount only warns (surfaced as `doseValidation.warnings` in
 * `MedicationService.create()`'s response, same "warn, don't hard-block" posture as this domain's
 * RxNorm `codeValidation`) — it never blocks.
 */
export const CreateMedicationSchema = z
  .object({
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
  })
  .superRefine((v, ctx) => {
    if (v.dose == null) return;
    for (const message of validateDose(v.dose).errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['dose'] });
    }
  });
export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;

export const DiscontinueMedicationSchema = z.object({
  stoppedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});
export type DiscontinueMedicationInput = z.infer<typeof DiscontinueMedicationSchema>;
