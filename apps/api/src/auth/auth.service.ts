import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { withTenantContext, type DB } from '@ehr/db';
import { recordAuditEvent } from '@ehr/audit';
import { InvalidCredentialsError, type IdentityProvider, type MfaEnrollment, type PasswordCredentialProvider, type TokenPair } from '@ehr/auth-adapter';
import { DB_CONNECTION, IDENTITY_PROVIDER } from '../common/tokens.js';

export interface RequestMeta {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export type LoginResult = { mfaRequired: true; mfaPendingToken: string } | ({ mfaRequired: false } & TokenPair);

/**
 * Login/refresh/logout happen before any request-scoped transaction exists (there is no
 * authenticated tenant yet), so this service cannot rely on the generic AuditInterceptor /
 * getCurrentTransaction() the way authenticated routes do — see apps/api's auth.controller.ts
 * marking these routes @SkipAudit. Instead it records the spec §7.1-required "authentication
 * events" audit entry explicitly, once the tenant is known.
 *
 * Known Phase 1 gap (tracked, not silently dropped): a failed login against a genuinely unknown
 * tenant slug has no tenant to scope an audit_events row to, so it is not currently audited.
 * Failed attempts against a KNOWN tenant with a wrong password/email are also not yet audited —
 * only successful logins are. Close this before any real pilot; spec §7.1 lists authentication
 * events (successful AND failed) as required audit capture.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider & PasswordCredentialProvider,
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
  ) {}

  /**
   * Real MFA (2026-09-27 pass, replacing ADR-0002's structural stub): if the user has enrolled,
   * this returns a short-lived `mfaPendingToken` instead of real tokens — the caller must present
   * it plus a valid TOTP code to `completeMfaChallenge()` before getting a usable session.
   *
   * Resolves the user, then checks the password as two separate calls (per ADR-0002's
   * SSO-readiness seam — `resolveUser` is the half a future federated provider would also
   * implement; `checkPassword` is first-party-only) rather than one combined call.
   */
  async login(tenantSlug: string, email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const { userId, tenantId, mfaEnrolled } = await this.identityProvider.resolveUser(tenantSlug, email);
    const validPassword = await this.identityProvider.checkPassword(userId, tenantId, password);
    if (!validPassword) {
      // Same error/message as "unknown user" — do not reveal whether the email exists.
      throw new InvalidCredentialsError('Unknown tenant, or invalid email/password');
    }

    if (mfaEnrolled) {
      const mfaPendingToken = await this.identityProvider.issueMfaPendingToken(userId, tenantId);
      await this.auditAuthEvent(tenantId, userId, 'auth.login.mfa_required', 'success', meta);
      return { mfaRequired: true, mfaPendingToken };
    }

    const tokens = await this.identityProvider.issueTokens(userId, tenantId);
    await this.auditAuthEvent(tenantId, userId, 'auth.login', 'success', meta);
    return { mfaRequired: false, ...tokens };
  }

  async completeMfaChallenge(mfaPendingToken: string, code: string, meta: RequestMeta): Promise<TokenPair> {
    const { userId, tenantId } = await this.identityProvider.verifyMfaPendingToken(mfaPendingToken);
    const valid = await this.identityProvider.verifyMfaChallenge(userId, tenantId, code);
    if (!valid) {
      await this.auditAuthEvent(tenantId, userId, 'auth.mfa_challenge', 'failure', meta);
      throw new InvalidMfaChallengeError('Invalid or expired MFA code');
    }
    const tokens = await this.identityProvider.issueTokens(userId, tenantId);
    await this.auditAuthEvent(tenantId, userId, 'auth.mfa_challenge', 'success', meta);
    return tokens;
  }

  async startMfaEnrollment(userId: string, tenantId: string, accountLabel: string): Promise<MfaEnrollment> {
    return this.identityProvider.startMfaEnrollment(userId, tenantId, accountLabel);
  }

  async confirmMfaEnrollment(userId: string, tenantId: string, code: string, meta: RequestMeta): Promise<void> {
    await this.identityProvider.confirmMfaEnrollment(userId, tenantId, code);
    await this.auditAuthEvent(tenantId, userId, 'auth.mfa_enroll', 'success', meta);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.identityProvider.refresh(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.identityProvider.revoke(refreshToken);
  }

  private async auditAuthEvent(
    tenantId: string,
    userId: string,
    action: string,
    outcome: 'success' | 'failure',
    meta: RequestMeta,
  ): Promise<void> {
    await withTenantContext(this.db, tenantId, (trx) =>
      recordAuditEvent(trx, {
        tenantId,
        actor: { type: 'user', id: userId },
        action,
        resource: { type: 'Session', id: null },
        requestId: meta.requestId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        outcome,
      }),
    );
  }
}

export class InvalidMfaChallengeError extends Error {}
