import { z } from 'zod';

export const LoginSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const MfaChallengeSchema = z.object({
  mfaPendingToken: z.string().min(1),
  code: z.string().min(1),
});
export type MfaChallengeInput = z.infer<typeof MfaChallengeSchema>;

export const MfaConfirmSchema = z.object({
  code: z.string().min(1),
});
export type MfaConfirmInput = z.infer<typeof MfaConfirmSchema>;

/** Item 22 layer 8 (break-glass) — spec §6.3's "explicit user action... reason code... time-limited
 * access." `durationMinutes` is capped well below a full shift so an emergency grant can't
 * accidentally become a standing one; the cap itself is an engineering safety bound, not a legal
 * determination. */
export const BreakglassInvokeSchema = z.object({
  patientId: z.string().uuid(),
  reasonCode: z.enum(['emergency_treatment', 'life_threatening', 'other']),
  justification: z.string().min(10).max(2000),
  durationMinutes: z.number().int().positive().max(240).default(60),
});
export type BreakglassInvokeInput = z.infer<typeof BreakglassInvokeSchema>;
