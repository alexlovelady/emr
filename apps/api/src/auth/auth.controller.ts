import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, NotImplementedException, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Audited, SkipAudit } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { getCurrentTransaction } from '@ehr/db';
import type { IdentityProvider } from '@ehr/auth-adapter';
import { UserService } from '@ehr/workforce';
import { IDENTITY_PROVIDER } from '../common/tokens.js';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { LoginSchema, MfaChallengeSchema, RefreshSchema, type LoginInput, type MfaChallengeInput, type RefreshInput } from './auth.dto.js';
import { AuthService } from './auth.service.js';

/**
 * `@SkipAuthz`/`@SkipAudit` are applied per-method here, not at the class level — `me()` needs
 * neither skipped (it's genuinely post-login, request-scoped data access that should be audited
 * like any other read, and it deliberately bypasses the staff PolicyEngine for a different reason
 * than "no tenant exists yet": a self-lookup needs no permission at all, the same reasoning
 * `RequestContext.actor.type`'s doc comment gives for why portal routes skip PolicyEngine too).
 * `Reflector.getAllAndOverride` checks the handler before the class, but falls back to the class
 * when metadata is absent on the handler — a class-level `@SkipAudit()` would still silently apply
 * to `me()` even with its own `@Audited()`, since there is no "un-skip" decorator.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    private readonly userService: UserService = new UserService(),
  ) {}

  @Post('login')
  @SkipAuthz()
  @SkipAudit()
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput, @Req() req: FastifyRequest) {
    return this.authService.login(body.tenantSlug, body.email, body.password, {
      // req.ehrContext is always set by TenantContextMiddleware (with a real UUID requestId)
      // even for this unauthenticated route — see its doc comment. The fallback here only
      // guards against some future route bypassing that middleware; it must be a real UUID
      // (audit_events.request_id is a uuid column), never a sentinel string like "unknown".
      requestId: req.ehrContext?.requestId ?? randomUUID(),
      ip: req.ip,
      ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
    });
  }

  @Post('refresh')
  @SkipAuthz()
  @SkipAudit()
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @SkipAuthz()
  @SkipAudit()
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshInput): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  /**
   * Structural stub (ADR-0002): returns 501 rather than pretending to enforce MFA. Present in
   * the OpenAPI contract so the gap is visible, not silently missing.
   */
  @Post('mfa/challenge')
  @SkipAuthz()
  @SkipAudit()
  async mfaChallenge(@Body(new ZodValidationPipe(MfaChallengeSchema)) body: MfaChallengeInput): Promise<never> {
    await this.identityProvider.verifyMfaChallenge(body.userId, body.code);
    throw new NotImplementedException('MFA is not implemented in Phase 1 — see ADR-0002.');
  }

  /**
   * "Who am I" — the JWT deliberately carries only `{userId, tenantId}` (see
   * `RequestContext`'s doc comment on why), so a caller needs this to resolve their own display
   * name/email. Self-lookup only: no `USER_MANAGE` permission required, unlike `GET /users/{id}`.
   */
  @Get('me')
  @SkipAuthz()
  @Audited('auth.me', 'User')
  async me(@Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    return this.userService.getById(getCurrentTransaction(), ctx, ctx.actor.id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
