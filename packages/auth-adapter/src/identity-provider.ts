import * as argon2 from 'argon2';
import { exportJWK } from 'jose';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { withSystemContext, withTenantContext } from '@ehr/db';
import type { KeyMaterial } from './keys.js';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  InvalidRefreshTokenError,
  signAccessToken,
  type TokenIssuerConfig,
} from './tokens.js';

export interface AuthResult {
  userId: string;
  tenantId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class InvalidCredentialsError extends Error {}

/**
 * ADR-0002's first-party stand-in for Auth0/Okta/Cognito. All token verification downstream goes
 * through JWKS only (see packages/auth-adapter's tokens.ts `verifyAccessToken`) so swapping in a
 * real OIDC provider later never touches verification call sites — only this class's
 * implementation of `IdentityProvider` changes.
 */
export interface IdentityProvider {
  verifyCredentials(tenantSlug: string, email: string, password: string): Promise<AuthResult>;
  issueTokens(userId: string, tenantId: string): Promise<TokenPair>;
  refresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
  getJWKS(): Promise<{ keys: Record<string, unknown>[] }>;
  /**
   * Structural stub (ADR-0002) — always resolves 'not_implemented' rather than pretending to
   * enforce MFA. Real MFA is a pilot go-live gate (EHR_REGULATORY_MANUAL.md §29), not a Phase 1
   * deliverable; apps/api's /auth/mfa/challenge route surfaces this as an honest 501.
   */
  verifyMfaChallenge(userId: string, code: string): Promise<'not_implemented'>;
}

export class FirstPartyIdentityProvider implements IdentityProvider {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly keys: KeyMaterial,
    private readonly config: TokenIssuerConfig & { refreshTokenTtlSeconds: number },
  ) {}

  async verifyCredentials(tenantSlug: string, email: string, password: string): Promise<AuthResult> {
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
        .select(['id', 'password_hash', 'status'])
        .where('email', '=', email)
        .executeTakeFirst(),
    );
    if (!user || user.status !== 'active') {
      // Deliberately the same error/message as "wrong password" — do not reveal whether the
      // email exists (spec §18 baseline security posture).
      throw new InvalidCredentialsError('Unknown tenant, or invalid email/password');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) throw new InvalidCredentialsError('Unknown tenant, or invalid email/password');

    return { userId: user.id, tenantId: tenant.id };
  }

  async issueTokens(userId: string, tenantId: string): Promise<TokenPair> {
    const accessToken = await signAccessToken({ userId, tenantId }, this.keys, this.config);

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

  async getJWKS(): Promise<{ keys: Record<string, unknown>[] }> {
    const jwk = await exportJWK(this.keys.publicKey);
    return { keys: [{ ...jwk, kid: this.keys.kid, use: 'sig', alg: 'ES256' }] };
  }

  async verifyMfaChallenge(): Promise<'not_implemented'> {
    return 'not_implemented';
  }
}
