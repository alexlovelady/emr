import { z } from 'zod';

/** Epic-parity item 4 — registering a SMART app for this tenant's catalog. `clientType: 'public'`
 * clients (e.g. a patient-facing SPA using PKCE) don't get a usable secret — one is still generated
 * and hashed for schema uniformity, but the token endpoint never requires it for a public client. */
export const CreateSmartClientSchema = z.object({
  displayName: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  developerName: z.string().max(200).nullish(),
  websiteUrl: z.string().url().nullish(),
  logoUrl: z.string().url().nullish(),
  allowedScopes: z.array(z.string().min(1)).min(1),
  redirectUris: z.array(z.string().url()).default([]),
  clientType: z.enum(['confidential', 'public']).default('confidential'),
  launchUri: z.string().url().nullish(),
});
export type CreateSmartClientInput = z.infer<typeof CreateSmartClientSchema>;

export const UpdateSmartClientSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  developerName: z.string().max(200).nullish(),
  websiteUrl: z.string().url().nullish(),
  logoUrl: z.string().url().nullish(),
  allowedScopes: z.array(z.string().min(1)).min(1).optional(),
  redirectUris: z.array(z.string().url()).optional(),
  launchUri: z.string().url().nullish(),
});
export type UpdateSmartClientInput = z.infer<typeof UpdateSmartClientSchema>;
