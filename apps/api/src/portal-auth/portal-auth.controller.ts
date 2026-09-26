import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SkipAudit } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  PortalLoginSchema,
  PortalRefreshSchema,
  RegisterPortalAccountSchema,
  type PortalLoginInput,
  type PortalRefreshInput,
  type RegisterPortalAccountInput,
} from './portal-auth.dto.js';
import { PortalAuthService } from './portal-auth.service.js';

/**
 * Portal counterpart to `apps/api/src/auth/auth.controller.ts` — same reasoning: `@SkipAuthz` (no
 * tenant/permission exists before a portal login succeeds) and `@SkipAudit` (no request-scoped
 * transaction exists yet; `PortalAuthService` audits explicitly once the tenant is known).
 */
@Controller('api/v1/portal/auth')
@SkipAuthz()
@SkipAudit()
export class PortalAuthController {
  constructor(@Inject(PortalAuthService) private readonly service: PortalAuthService) {}

  @Post('register')
  @HttpCode(200)
  async register(@Body(new ZodValidationPipe(RegisterPortalAccountSchema)) body: RegisterPortalAccountInput, @Req() req: FastifyRequest) {
    return this.service.register(body, {
      requestId: req.ehrContext?.requestId ?? randomUUID(),
      ip: req.ip,
      ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
    });
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(PortalLoginSchema)) body: PortalLoginInput, @Req() req: FastifyRequest) {
    return this.service.login(body.tenantSlug, body.email, body.password, {
      requestId: req.ehrContext?.requestId ?? randomUUID(),
      ip: req.ip,
      ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
    });
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(PortalRefreshSchema)) body: PortalRefreshInput) {
    return this.service.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(PortalRefreshSchema)) body: PortalRefreshInput): Promise<void> {
    await this.service.logout(body.refreshToken);
  }
}
