import { z } from 'zod';

/**
 * Registration requires a real, if minimal, identity-proofing check: the caller must already know
 * an existing patient's id AND date of birth (EHR_BUILD_SPEC.md §17) — a "just pick any patientId"
 * registration would be a real access-control hole.
 */
export const RegisterPortalAccountSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  patientId: z.string().uuid(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
});
export type RegisterPortalAccountInput = z.infer<typeof RegisterPortalAccountSchema>;

export const PortalLoginSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
export type PortalLoginInput = z.infer<typeof PortalLoginSchema>;

export const PortalRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type PortalRefreshInput = z.infer<typeof PortalRefreshSchema>;
