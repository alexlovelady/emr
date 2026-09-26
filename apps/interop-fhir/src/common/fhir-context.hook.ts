import type { FastifyRequest } from 'fastify';
import type { KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import { verifySmartAccessToken } from '../token/smart-token.js';
import './fastify-request.js';

/**
 * Fastify `onRequest` hook (registered directly, not Nest middleware — same reasoning as
 * apps/api's `tenant-context.hook.ts`): verifies the SMART bearer token and attaches
 * `req.fhirContext`. Leaves it unset on a missing/invalid token — `SmartScopeGuard` is what turns
 * that into a 403 for routes that require a scope; `/fhir/r4/metadata` has none and stays public.
 */
export function attachFhirContext(keys: KeyMaterial, env: Pick<Env, 'JWT_ISSUER' | 'JWT_AUDIENCE'>) {
  return async function onRequest(req: FastifyRequest): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;
    const token = authHeader.slice('Bearer '.length);
    try {
      const claims = await verifySmartAccessToken(token, keys.publicKey, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
      req.fhirContext = claims;
    } catch {
      // Invalid/expired token: leave fhirContext unset — SmartScopeGuard denies scoped routes.
    }
  };
}
