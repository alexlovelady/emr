import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { verifyAccessToken, type KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import '@ehr/api-contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuidOrGenerate(value: string | undefined): string {
  return value && UUID_RE.test(value) ? value : randomUUID();
}

/**
 * Same reasoning as `apps/api`'s hook of the same name: a genuine Fastify `onRequest` hook, not
 * Nest `NestMiddleware` (which receives the raw `http.IncomingMessage` under
 * `@nestjs/platform-fastify`, not the decorated `FastifyRequest` guards/interceptors/controllers
 * see). This app reuses the exact same staff/system JWT auth as `apps/api` — an HL7 interface
 * engine authenticates as a normal internal actor with the `interop.hl7.ingest` permission, not
 * as a SMART client (that mechanism is `apps/interop-fhir`'s, a genuinely different audience).
 */
export function attachEhrContext(keys: KeyMaterial, env: Pick<Env, 'JWT_ISSUER' | 'JWT_AUDIENCE'>) {
  return async function onRequest(req: FastifyRequest): Promise<void> {
    const requestId = asUuidOrGenerate(req.headers['x-request-id'] as string | undefined);
    const correlationId = asUuidOrGenerate((req.headers['x-correlation-id'] as string | undefined) ?? requestId);

    req.ehrContext = {
      tenantId: '',
      requestId,
      correlationId,
      ip: req.ip,
      ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
    };

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const claims = await verifyAccessToken(token, keys.publicKey, {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        });
        req.ehrContext.tenantId = claims.tenantId;
        req.ehrContext.actor = { id: claims.userId, type: 'user' };
      } catch {
        // Invalid/expired token: leave actor unset — AuthzInterceptor denies any route requiring a permission.
      }
    }
  };
}
