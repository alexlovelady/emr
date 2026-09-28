import { z } from 'zod';

const ClientCredentialsGrantSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().min(1),
});

/**
 * The standalone-launch code exchange. `client_secret` is only required for a `confidential`
 * client — a `public` client (native/SPA) relies on PKCE alone, per RFC 7636 — so it's optional
 * here and `TokenService` enforces the real requirement based on the client's own `client_type`.
 */
const AuthorizationCodeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1).nullish(),
  code_verifier: z.string().min(1),
});

export const TokenRequestSchema = z.discriminatedUnion('grant_type', [ClientCredentialsGrantSchema, AuthorizationCodeGrantSchema]);
export type TokenRequestInput = z.infer<typeof TokenRequestSchema>;

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  /** SMART launch context — present only for an authorization_code exchange. */
  patient?: string;
}
