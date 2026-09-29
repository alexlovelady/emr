import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { exportJWK } from 'jose';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { withSystemContext, withTenantContext } from '@ehr/db';
import { UnauthorizedError } from '@ehr/domain-common';
import { findKey, getCurrentKey, type KeyRingStore } from './keyring.js';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  InvalidRefreshTokenError,
  signAccessToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  type MfaPendingClaims,
  type TokenIssuerConfig,
} from './tokens.js';

export interface AuthResult {
  userId: string;
  tenantId: string;
  mfaEnrolled: boolean;
}

export type ResolvedUser = AuthResult;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export class InvalidCredentialsError extends UnauthorizedError {}
export class InvalidMfaCodeError extends UnauthorizedError {}

/**
 * ADR-0002's first-party stand-in for Auth0/Okta/Cognito. All token verification downstream goes
 * through JWKS only (see packages/auth-adapter's tokens.ts `verifyAccessToken`) so swapping in a
 * real OIDC provider later never touches verification call sites — only this class's
 * implementation of `IdentityProvider` changes.
 *
 * `resolveUser` — "which user is this authentication event for" — is the only user-lookup step
 * every provider must implement, password-based or federated: a future SAML/OIDC provider
 * resolves the user from its own signed assertion and never needs `checkPassword` at all. Password
 * verification is split out into the separate `PasswordCredentialProvider` interface below so it
 * isn't forced onto implementations that don't use passwords.
 */
export interface IdentityProvider {
  resolveUser(tenantSlug: string, email: string): Promise<ResolvedUser>;
  issueTokens(userId: string, tenantId: string): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
  getJWKS(): Promise<{ keys: Record<string, unknown>[] }>;
  /** Generates a new signing key, makes it current, and prunes any key past its retention window —
   * see `rotateKeyRing`'s own doc comment. Existing, not-yet-expired tokens signed by the outgoing
   * key keep verifying (it's retained, just no longer used to sign new ones). */
  rotateSigningKey(): Promise<void>;
  /** Issued by `AuthService.login()` when `mfa_enrolled` is true, instead of real tokens. */
  issueMfaPendingToken(userId: string, tenantId: string): Promise<string>;
  verifyMfaPendingToken(token: string): Promise<MfaPendingClaims>;
  /** Generates and stores a new TOTP secret for a user, not yet enrolled until `confirmMfaEnrollment` succeeds. */
  startMfaEnrollment(userId: string, tenantId: string, accountLabel: string): Promise<MfaEnrollment>;
  /** Verifies the first code against the pending secret and flips `mfa_enrolled` on. */
  confirmMfaEnrollment(userId: string, tenantId: string, code: string): Promise<void>;
  /** Real TOTP verification — replaces the old structural 'not_implemented' stub. */
  verifyMfaChallenge(userId: string, tenantId: string, code: string): Promise<boolean>;
}

/**
 * The password-checking half of authentication — deliberately not part of `IdentityProvider`
 * itself, since a federated provider (SAML/OIDC) proves identity via its own signed assertion in
 * `resolveUser` and never needs to accept or check a password.
 */
export interface PasswordCredentialProvider {
  checkPassword(userId: string, tenantId: string, password: string): Promise<boolean>;
}

export class FirstPartyIdentityProvider implements IdentityProvider, PasswordCredentialProvider {
  constructor(
    private readonly db: Kysely<DB>,
    /** Shared with this process's Fastify auth hooks (see tenant-context.hook.ts) — every method
     * below always reads `this.keyRingStore.get()` fresh (never captures a `KeyRing` once at
     * construction), so a rotation or a reload picked up by the store takes effect on this
     * instance's very next call, no restart needed. */
    private readonly keyRingStore: KeyRingStore,
    private readonly config: TokenIssuerConfig & { refreshTokenTtlSeconds: number },
  ) {}

  async resolveUser(tenantSlug: string, email: string): Promise<ResolvedUser> {
    const tenant = await withSystemContext(this.db, (trx) =>
      trx
        .selectFrom('tenants')
        .select(['id'])
        .where('slug', '=', tenantSlug)
        .where('status', '=', 'active')
        .executeTakeFirst(),
    );
    if (!tenant) throw new InvalidCredentialsError('Unknown tenant, or invalid email/password');

    const user = await withTenantContext(this.db, tenant.id, (trx) =>
      trx
        .selectFrom('users')
        .select(['id', 'status', 'mfa_enrolled'])
        .where('email', '=', email)
        .executeTakeFirst(),
    );
    if (!user || user.status !== 'active') {
      // Deliberately the same error/message as "wrong password" — do not reveal whether the
      // email exists (spec §18 baseline security posture).
      throw new InvalidCredentialsError('Unknown tenant, or invalid email/password');
    }

    return { userId: user.id, tenantId: tenant.id, mfaEnrolled: user.mfa_enrolled };
  }

  async checkPassword(userId: string, tenantId: string, password: string): Promise<boolean> {
    const user = await withTenantContext(this.db, tenantId, (trx) =>
      trx.selectFrom('users').select(['password_hash']).where('id', '=', userId).executeTakeFirst(),
    );
    if (!user) return false;
    return argon2.verify(user.password_hash, password);
  }

  async issueTokens(userId: string, tenantId: string): Promise<TokenPair> {
    const accessToken = await signAccessToken({ userId, tenantId }, getCurrentKey(this.keyRingStore.get()), this.config);

    const secret = generateRefreshSecret();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
    await withTenantContext(this.db, tenantId, (trx) =>
      trx
        .insertInto('refresh_tokens')
        .values({
          tenant_id: tenantId,
          user_id: userId,
          token_hash: hashRefreshSecret(secret),
          expires_at: expiresAt,
          status: 'active',
        })
        .execute(),
    );

    return { accessToken, refreshToken: encodeRefreshToken(tenantId, secret) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const { tenantId, secret } = decodeRefreshToken(refreshToken);
    const tokenHash = hashRefreshSecret(secret);

    const row = await withTenantContext(this.db, tenantId, (trx) =>
      trx
        .selectFrom('refresh_tokens')
        .select(['id', 'user_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', tokenHash)
        .executeTakeFirst(),
    );
    if (!row || row.revoked_at !== null || row.expires_at.getTime() < Date.now()) {
      throw new InvalidRefreshTokenError('Refresh token is invalid, expired, or revoked');
    }

    // Rotate: revoke the presented token before issuing a new pair, so a leaked-and-reused
    // refresh token is a one-shot, detectable event rather than a standing credential.
    await withTenantContext(this.db, tenantId, (trx) =>
      trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', row.id).execute(),
    );

    return this.issueTokens(row.user_id, tenantId);
  }

  async revoke(refreshToken: string): Promise<void> {
    let decoded;
    try {
      decoded = decodeRefreshToken(refreshToken);
    } catch {
      return; // already malformed/unusable — nothing to revoke
    }
    await withTenantContext(this.db, decoded.tenantId, (trx) =>
      trx
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date() })
        .where('token_hash', '=', hashRefreshSecret(decoded.secret))
        .execute(),
    );
  }

  /** Every key still in the ring, not just the current one — the standard JWKS-rotation contract:
   * a client fetching this mid-rotation must still be able to verify a token signed moments ago by
   * the outgoing key, not only the brand-new one. */
  async getJWKS(): Promise<{ keys: Record<string, unknown>[] }> {
    const jwks = await Promise.all(
      this.keyRingStore.get().keys.map(async (k) => {
        const jwk = await exportJWK(k.publicKey);
        return { ...jwk, kid: k.kid, use: 'sig', alg: 'ES256' };
      }),
    );
    return { keys: jwks };
  }

  async issueMfaPendingToken(userId: string, tenantId: string): Promise<string> {
    return signMfaPendingToken({ userId, tenantId }, getCurrentKey(this.keyRingStore.get()), this.config.issuer);
  }

  async verifyMfaPendingToken(token: string): Promise<MfaPendingClaims> {
    return verifyMfaPendingToken(token, (header) => {
      const key = findKey(this.keyRingStore.get(), header.kid);
      if (!key) throw new Error(`Unknown signing key (kid=${header.kid ?? 'none'})`);
      return key.publicKey;
    }, this.config.issuer);
  }

  async rotateSigningKey(): Promise<void> {
    await this.keyRingStore.rotate();
  }

  async startMfaEnrollment(userId: string, tenantId: string, accountLabel: string): Promise<MfaEnrollment> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(accountLabel, 'EHR', secret);
    // Stored before confirmation — mfa_enrolled stays false until confirmMfaEnrollment verifies a
    // real code, so an abandoned enrollment attempt never silently locks the account out.
    await withTenantContext(this.db, tenantId, (trx) =>
      trx.updateTable('users').set({ mfa_secret: secret, updated_at: new Date() }).where('id', '=', userId).execute(),
    );
    return { secret, otpauthUrl };
  }

  async confirmMfaEnrollment(userId: string, tenantId: string, code: string): Promise<void> {
    const user = await withTenantContext(this.db, tenantId, (trx) =>
      trx.selectFrom('users').select(['mfa_secret']).where('id', '=', userId).executeTakeFirst(),
    );
    if (!user?.mfa_secret || !authenticator.verify({ token: code, secret: user.mfa_secret })) {
      throw new InvalidMfaCodeError('Invalid or expired MFA code');
    }
    await withTenantContext(this.db, tenantId, (trx) =>
      trx
        .updateTable('users')
        .set({ mfa_enrolled: true, mfa_method: 'totp', updated_at: new Date() })
        .where('id', '=', userId)
        .execute(),
    );
  }

  async verifyMfaChallenge(userId: string, tenantId: string, code: string): Promise<boolean> {
    const user = await withTenantContext(this.db, tenantId, (trx) =>
      trx.selectFrom('users').select(['mfa_secret', 'mfa_enrolled']).where('id', '=', userId).executeTakeFirst(),
    );
    if (!user?.mfa_enrolled || !user.mfa_secret) return false;
    return authenticator.verify({ token: code, secret: user.mfa_secret });
  }
}
