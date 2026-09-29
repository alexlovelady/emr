import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Audited, SkipAudit } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission, SkipAuthz, getEffectivePermissions } from '@ehr/authz';
import type { IdentityProvider } from '@ehr/auth-adapter';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { getCurrentTransaction } from '@ehr/db';
import { UserService } from '@ehr/workforce';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  LoginSchema,
  MfaChallengeSchema,
  MfaConfirmSchema,
  RefreshSchema,
  type LoginInput,
  type MfaChallengeInput,
  type MfaConfirmInput,
  type RefreshInput,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { IDENTITY_PROVIDER } from '../common/tokens.js';

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
    return this.authService.login(body.tenantSlug, body.email, body.password, requestMeta(req));
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
   * Real MFA (2026-09-27), replacing ADR-0002's structural 501 stub. `mfaPendingToken` (from
   * `login()`'s `{mfaRequired: true}` response) proves the caller already presented a correct
   * password for this specific user — a raw client-supplied `userId` was the old (unbuilt) design
   * and would have let an attacker brute-force a TOTP code against an arbitrary existing user with
   * no password check at all.
   */
  @Post('mfa/challenge')
  @SkipAuthz()
  @SkipAudit()
  @HttpCode(200)
  async mfaChallenge(@Body(new ZodValidationPipe(MfaChallengeSchema)) body: MfaChallengeInput, @Req() req: FastifyRequest) {
    return this.authService.completeMfaChallenge(body.mfaPendingToken, body.code, requestMeta(req));
  }

  /**
   * Self-service enrollment — any authenticated user may enroll themselves (no permission key
   * beyond "is logged in"), same posture as `me()`/`permissions()`. Returns a secret + otpauth URI
   * for the caller to render as a QR code; `mfa_enrolled` stays false until `mfa/confirm` verifies
   * the first real code, so an abandoned enrollment never locks the account out.
   */
  @Post('mfa/enroll')
  @SkipAuthz()
  @Audited('auth.mfa_enroll_start', 'User')
  async mfaEnroll(@Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    const user = await this.userService.getById(getCurrentTransaction(), ctx, ctx.actor.id);
    return this.authService.startMfaEnrollment(ctx.actor.id, ctx.tenantId, user.email);
  }

  @Post('mfa/confirm')
  @SkipAuthz()
  @Audited('auth.mfa_enroll_confirm', 'User')
  async mfaConfirm(@Body(new ZodValidationPipe(MfaConfirmSchema)) body: MfaConfirmInput, @Req() req: FastifyRequest): Promise<{ ok: true }> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    await this.authService.confirmMfaEnrollment(ctx.actor.id, ctx.tenantId, body.code, requestMeta(req));
    return { ok: true };
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

  /**
   * The caller's own effective permission set — for the frontend to hide/disable actions it
   * can't use, not a new authorization boundary (every write endpoint still enforces its own
   * `@RequirePermission` regardless of what this returns). Self-lookup only, same reasoning as
   * `me()`. Deliberately a fresh DB read every call, never cached/embedded in the JWT — see
   * `getEffectivePermissions`'s doc comment.
   */
  @Get('permissions')
  @SkipAuthz()
  @Audited('auth.permissions', 'User')
  async permissions(@Req() req: FastifyRequest): Promise<{ permissions: string[] }> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    const permissions = await getEffectivePermissions(getCurrentTransaction(), ctx.tenantId, ctx.actor.id);
    return { permissions };
  }

  /**
   * Generates a new signing key and makes it current, without invalidating any token signed by the
   * outgoing key (it's retained for its own rotation-retention window — see
   * `IdentityProvider.rotateSigningKey`'s doc comment). A global, not tenant-scoped, action — there
   * is exactly one keyring shared by every tenant on this deployment — so this deliberately checks a
   * platform-level permission rather than being callable per-tenant.
   */
  @Post('keys/rotate')
  @RequirePermission(PERMISSION_KEYS.SECURITY_KEY_ROTATE)
  @Audited('auth.keys_rotate', 'KeyRing')
  @HttpCode(200)
  async rotateKeys(): Promise<{ ok: true }> {
    await this.identityProvider.rotateSigningKey();
    return { ok: true };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}

function requestMeta(req: FastifyRequest): { requestId: string; ip?: string; userAgent?: string } {
  return {
    // req.ehrContext is always set by TenantContextMiddleware (with a real UUID requestId)
    // even for unauthenticated routes — see its doc comment. The fallback here only guards
    // against some future route bypassing that middleware; it must be a real UUID
    // (audit_events.request_id is a uuid column), never a sentinel string like "unknown".
    requestId: req.ehrContext?.requestId ?? randomUUID(),
    ip: req.ip,
    ...(req.headers['user-agent'] !== undefined ? { userAgent: req.headers['user-agent'] } : {}),
  };
}
