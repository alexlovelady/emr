import { z } from 'zod';

export const SmartAuthorizeDecisionSchema = z.object({
  decision: z.enum(['allow', 'deny']),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  scope: z.string().min(1),
  state: z.string().min(1).nullish(),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
  /** Which of the account's accessible patients (see `GET /api/v1/portal/patients`) this launch
   * is for — chosen via the consent screen's patient picker when the account has more than one. */
  patientId: z.string().uuid(),
});
export type SmartAuthorizeDecisionInput = z.infer<typeof SmartAuthorizeDecisionSchema>;

export interface SmartAuthorizeDecisionResult {
  redirectUrl: string;
}
