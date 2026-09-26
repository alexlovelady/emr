import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SkipAudit } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { NotImplementedException } from '@nestjs/common';
import type { IdentityProvider } from '@ehr/auth-adapter';
import { IDENTITY_PROVIDER } from '../common/tokens.js';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { LoginSchema, MfaChallengeSchema, RefreshSchema, type LoginInput, type MfaChallengeInput, type RefreshInput } from './auth.dto.js';
import { AuthService } from './auth.service.js';

/**
 * All routes here are @SkipAuthz (no tenant/permission exists yet before login succeeds) and
 * @SkipAudit (no request-scoped transaction exists yet — see AuthService's doc comment for how
 * login is audited explicitly instead).
 */
@Controller('api/v1/auth')
@SkipAuthz()
@SkipAudit()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput, @Req() req: FastifyRequest) {
    return this.authService.login(body.tenantSlug, body.email, body.password, {
      requestId: req.ehrContext?.requestId ?? 'unknown',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  /**
   * Structural stub (ADR-0002): returns 501 rather than pretending to enforce MFA. Present in
   * the OpenAPI contract so the gap is visible, not silently missing.
   */
  @Post('mfa/challenge')
  async mfaChallenge(@Body(new ZodValidationPipe(MfaChallengeSchema)) body: MfaChallengeInput): Promise<never> {
    await this.identityProvider.verifyMfaChallenge(body.userId, body.code);
    throw new NotImplementedException('MFA is not implemented in Phase 1 — see ADR-0002.');
  }
}
