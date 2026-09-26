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
  userId: z.string().uuid(),
  code: z.string().min(1),
});
export type MfaChallengeInput = z.infer<typeof MfaChallengeSchema>;
