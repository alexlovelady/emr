import { z } from 'zod';
import { PaginationQuerySchema } from '@ehr/api-contracts';

export const CreatePatientSchema = z.object({
  givenName: z.string().min(1).max(200),
  familyName: z.string().min(1).max(200),
  middleName: z.string().max(200).nullish(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
  sexAtBirth: z.string().max(50).nullish(),
  genderIdentity: z.string().max(50).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().nullish(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(200).nullish(),
  state: z.string().max(100).nullish(),
  postalCode: z.string().max(20).nullish(),
  country: z.string().max(100).nullish(),
  preferredLanguage: z.string().max(50).nullish(),
});
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const FindDuplicatesQuerySchema = z.object({
  givenName: z.string().min(1).max(200).optional(),
  familyName: z.string().min(1).max(200).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
});
export type FindDuplicatesQuery = z.infer<typeof FindDuplicatesQuerySchema>;

/** Contact fields only — never name/DOB (`@ehr/portal`'s profile-update feature). */
export const UpdatePatientContactSchema = z.object({
  phone: z.string().max(50).nullish(),
  email: z.string().email().nullish(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(200).nullish(),
  state: z.string().max(100).nullish(),
  postalCode: z.string().max(20).nullish(),
  country: z.string().max(100).nullish(),
});
export type UpdatePatientContactInput = z.infer<typeof UpdatePatientContactSchema>;

/** `search` matches against name (either order) or date of birth — same fields the client-side
 * filter this replaces used to match on. Merged with the shared opt-in pagination shape. */
export const ListPatientsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});
export type ListPatientsQuery = z.infer<typeof ListPatientsQuerySchema>;

export const MergePatientsSchema = z.object({
  sourcePatientId: z.string().uuid(),
  reason: z.string().max(500).nullish(),
});
export type MergePatientsInput = z.infer<typeof MergePatientsSchema>;
