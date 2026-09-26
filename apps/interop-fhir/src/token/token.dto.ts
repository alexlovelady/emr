import { z } from 'zod';

/**
 * SMART Backend Services-style client-credentials grant only (spec's Phase 4 decision: no
 * interactive authorization-code/launch-context/patient-picker flow — that needs a consent UI
 * this API-only build doesn't have).
 */
export const TokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().min(1),
});
export type TokenRequestInput = z.infer<typeof TokenRequestSchema>;

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
}
