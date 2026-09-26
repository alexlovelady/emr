import { randomUUID } from 'node:crypto';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken, type KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import '@ehr/api-contracts';
import { KEY_MATERIAL, ENV_CONFIG } from './tokens.js';

/**
 * Runs before any guard/interceptor (Nest's request lifecycle: middleware -> guards ->
 * interceptors -> handler). Verifies the bearer token if present and attaches `req.ehrContext`
 * — the single source of truth every downstream piece (RequestTransactionInterceptor,
 * AuthzInterceptor, AuditInterceptor, domain controllers) reads from. Does NOT reject requests
 * with no/invalid token itself — a missing `ehrContext` simply means AuthzInterceptor denies
 * anything requiring @RequirePermission; routes marked @SkipAuthz (login, refresh, JWKS, health)
 * work fine with no token at all.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(KEY_MATERIAL) private readonly keys: KeyMaterial,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  async use(req: FastifyRequest, _res: FastifyReply, next: () => void): Promise<void> {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? requestId;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const claims = await verifyAccessToken(token, this.keys.publicKey, {
          issuer: this.env.JWT_ISSUER,
          audience: this.env.JWT_AUDIENCE,
        });
        req.ehrContext = {
          tenantId: claims.tenantId,
          actor: { id: claims.userId, type: 'user' },
          requestId,
          correlationId,
          ip: req.ip,
          ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
        };
      } catch {
        // Invalid/expired token: leave ehrContext unset. AuthzInterceptor will deny any route
        // that requires a permission; @SkipAuthz routes are unaffected either way.
      }
    }

    next();
  }
}
