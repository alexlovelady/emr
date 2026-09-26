import { z } from 'zod';

/**
 * `isControlledSubstance`/`deaSchedule` consistency and the Schedule II no-refills rule
 * (a real DEA rule — Schedule II drugs cannot be refilled, each fill needs a new prescription)
 * are enforced here at the DTO layer, cheaply, regardless of which route (ordinary vs.
 * `/controlled`) receives the payload. See `prescription.service.ts` for the route/payload
 * consistency check (`expectedControlled`), which is a separate concern from this shape validation.
 */
export const CreatePrescriptionSchema = z
  .object({
    encounterId: z.string().uuid().nullish(),
    prescriberId: z.string().uuid(),
    medicationName: z.string().min(1).max(300),
    rxnormCode: z.string().max(50).nullish(),
    dose: z.string().max(100).nullish(),
    route: z.string().max(100).nullish(),
    frequency: z.string().max(100).nullish(),
    quantity: z.string().min(1).max(100),
    daysSupply: z.number().int().positive().nullish(),
    refillsAuthorized: z.number().int().min(0).default(0),
    directions: z.string().min(1).max(1000),
    pharmacyNcpdpId: z.string().min(1).max(50),
    pharmacyName: z.string().min(1).max(300),
    isControlledSubstance: z.boolean().default(false),
    deaSchedule: z.enum(['II', 'III', 'IV', 'V']).nullish(),
  })
  .refine((v) => (v.deaSchedule != null ? v.isControlledSubstance : true), {
    message: 'deaSchedule may only be set when isControlledSubstance is true',
    path: ['deaSchedule'],
  })
  .refine((v) => (v.isControlledSubstance ? v.deaSchedule != null : true), {
    message: 'deaSchedule is required when isControlledSubstance is true',
    path: ['deaSchedule'],
  })
  .refine((v) => !(v.deaSchedule === 'II' && v.refillsAuthorized > 0), {
    message: 'Schedule II controlled substances cannot be authorized with refills',
    path: ['refillsAuthorized'],
  });
export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionSchema>;

export const DenyRefillSchema = z.object({
  denialReason: z.string().min(1).max(1000),
});
export type DenyRefillInput = z.infer<typeof DenyRefillSchema>;
