import type { FastifyRequest } from 'fastify';
import { verifyPortalAccessToken, type KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';

/**
 * A second Fastify `onRequest` hook, registered alongside `attachEhrContext` in main.ts — NOT a
 * replacement for it. `req.ehrContext` is always already set by `attachEhrContext` by the time
 * this runs (requestId/correlationId/ip at minimum); this hook only ever *adds* `.actor` when a
 * portal-audience token verifies, and only when `attachEhrContext` didn't already set one from a
 * staff token. The two hooks trying the same bearer token against two different audiences is what
 * makes a staff token structurally unable to authenticate a portal route and vice versa — see
 * README's Phase 8 scope decisions.
 */
export function attachPortalContext(keys: KeyMaterial, env: Pick<Env, 'JWT_ISSUER' | 'PORTAL_JWT_AUDIENCE'>) {
  return async function onRequest(req: FastifyRequest): Promise<void> {
    if (!req.ehrContext || req.ehrContext.actor) {
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return;
    }
    const token = authHeader.slice('Bearer '.length);
    try {
      const claims = await verifyPortalAccessToken(token, keys.publicKey, {
        issuer: env.JWT_ISSUER,
        audience: env.PORTAL_JWT_AUDIENCE,
      });
      req.ehrContext.tenantId = claims.tenantId;
      req.ehrContext.actor = { id: claims.portalAccountId, type: 'patient' };
    } catch {
      // Invalid/expired/wrong-audience token: leave actor unset, same as attachEhrContext.
    }
  };
}
