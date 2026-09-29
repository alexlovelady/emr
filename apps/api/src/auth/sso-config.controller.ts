import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { TenantSsoConfigRepository, type TenantSsoConfigRow } from '@ehr/auth-adapter';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { SsoConfigUpsertSchema, type SsoConfigUpsertInput } from './auth.dto.js';

/**
 * Item 23: lets a tenant admin configure + enable federated login for their own tenant — see
 * `packages/db/migrations/0057_tenant_sso_configs.ts` and `FederatedIdentityProvider`'s doc
 * comment for the full mechanism this feeds. Enabling a config here does not, by itself, let
 * anyone new log in: `NoopSsoAssertionVerifier` fail-closes every attempt until a real verifier is
 * plugged in for the chosen protocol.
 */
@Controller('api/v1/auth/sso')
export class SsoConfigController {
  private readonly repo = new TenantSsoConfigRepository();

  @Get('config')
  @RequirePermission(PERMISSION_KEYS.SSO_MANAGE)
  @Audited('auth.sso_config_read', 'TenantSsoConfig')
  async get(@Req() req: FastifyRequest): Promise<TenantSsoConfigRow | null> {
    const ctx = requireCtx(req);
    return this.repo.get(getCurrentTransaction(), ctx.tenantId);
  }

  @Put('config')
  @RequirePermission(PERMISSION_KEYS.SSO_MANAGE)
  @Audited('auth.sso_config_upsert', 'TenantSsoConfig')
  async upsert(@Body(new ZodValidationPipe(SsoConfigUpsertSchema)) body: SsoConfigUpsertInput, @Req() req: FastifyRequest): Promise<TenantSsoConfigRow> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    return this.repo.upsert(
      getCurrentTransaction(),
      ctx.tenantId,
      { protocol: body.protocol, enabled: body.enabled, issuer: body.issuer, clientId: body.clientId ?? null, metadataUrl: body.metadataUrl ?? null },
      ctx.actor.id,
    );
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
