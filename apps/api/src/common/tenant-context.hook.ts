import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { findKey, verifyAccessToken, type KeyRingStore } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import '@ehr/api-contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** audit_events.request_id/correlation_id are `uuid` columns — never trust an arbitrary string. */
function asUuidOrGenerate(value: string | undefined): string {
  return value && UUID_RE.test(value) ? value : randomUUID();
}

/** Item 22 layer 5's "purpose of use" signal — a real HIPAA minimum-necessary concept, not
 * per-category legal content (see `purpose-sensitivity.layer.ts`'s doc comment). An absent or
 * unrecognized value is simply left unset, which `purpose-sensitivity.layer.ts` treats the same as
 * "treatment" (never vetoes) — this header is additive, never a new way to fail a request. */
const KNOWN_PURPOSES = new Set(['treatment', 'payment', 'operations']);
function purposeOfUse(value: string | undefined): string | undefined {
  return value !== undefined && KNOWN_PURPOSES.has(value) ? value : undefined;
}

/**
 * Registered as a Fastify `onRequest` hook in main.ts — deliberately NOT a Nest `NestMiddleware`
 * (the `MiddlewareConsumer`/`NestModule` abstraction). Under `@nestjs/platform-fastify`, Nest's
 * Express-style middleware system invokes middleware with the RAW `http.IncomingMessage`/
 * `ServerResponse` (via `@fastify/middie`), not the decorated `FastifyRequest`/`FastifyReply`
 * that route handlers, guards, and interceptors receive from
 * `ExecutionContext.switchToHttp().getRequest()`. Setting `req.ehrContext` there sets it on an
 * object nothing downstream ever reads. A genuine Fastify hook receives the real, shared
 * `FastifyRequest` instance, so this actually works.
 *
 * Always attaches `req.ehrContext` — every downstream piece reads from it for request tracing
 * (requestId/correlationId) whether or not the request is authenticated. `ehrContext.actor` is
 * the actual authentication signal — absent unless a valid bearer token was verified —
 * everything else checks `.actor`, not the presence of `ehrContext` itself, so @SkipAuthz routes
 * (login, refresh, JWKS, health) work fine with no token, while still getting a real request id
 * for their own audit/logging needs (see AuthService, which audits login explicitly since it
 * runs before RequestTransactionInterceptor would ever open a tenant transaction for it).
 */
export function attachEhrContext(keyRingStore: KeyRingStore, env: Pick<Env, 'JWT_ISSUER' | 'JWT_AUDIENCE'>) {
  return async function onRequest(req: FastifyRequest): Promise<void> {
    const requestId = asUuidOrGenerate(req.headers['x-request-id'] as string | undefined);
    const correlationId = asUuidOrGenerate((req.headers['x-correlation-id'] as string | undefined) ?? requestId);

    const purpose = purposeOfUse(req.headers['x-purpose-of-use'] as string | undefined);
    req.ehrContext = {
      tenantId: '',
      requestId,
      correlationId,
      ip: req.ip,
      ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
      ...(purpose !== undefined ? { purpose } : {}),
    };

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const claims = await verifyAccessToken(
          token,
          (header) => {
            const key = findKey(keyRingStore.get(), header.kid);
            if (!key) throw new Error(`Unknown signing key (kid=${header.kid ?? 'none'})`);
            return key.publicKey;
          },
          { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
        );
        req.ehrContext.tenantId = claims.tenantId;
        req.ehrContext.actor = { id: claims.userId, type: 'user' };
      } catch {
        // Invalid/expired token: leave actor unset. AuthzInterceptor will deny any route that
        // requires a permission; @SkipAuthz routes are unaffected either way.
      }
    }
  };
}
