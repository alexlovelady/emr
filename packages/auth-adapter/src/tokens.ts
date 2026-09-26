import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT, type KeyLike } from 'jose';
import { JWT_ALG, type KeyMaterial } from './keys.js';

export interface TokenIssuerConfig {
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

export interface AccessTokenClaims {
  userId: string;
  tenantId: string;
}

export class InvalidAccessTokenError extends Error {}
export class InvalidRefreshTokenError extends Error {}

export async function signAccessToken(
  claims: AccessTokenClaims,
  keys: KeyMaterial,
  config: TokenIssuerConfig,
): Promise<string> {
  return new SignJWT({ tenant_id: claims.tenantId })
    .setProtectedHeader({ alg: JWT_ALG, kid: keys.kid })
    .setSubject(claims.userId)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(keys.privateKey);
}

export async function verifyAccessToken(
  token: string,
  publicKey: KeyLike,
  config: Pick<TokenIssuerConfig, 'issuer' | 'audience'>,
): Promise<AccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, publicKey, {
      issuer: config.issuer,
      audience: config.audience,
    }));
  } catch (err) {
    throw new InvalidAccessTokenError(err instanceof Error ? err.message : String(err));
  }

  if (typeof payload.sub !== 'string' || typeof payload.tenant_id !== 'string') {
    throw new InvalidAccessTokenError('Access token is missing required claims (sub, tenant_id)');
  }
  return { userId: payload.sub, tenantId: payload.tenant_id };
}

/**
 * Refresh tokens are `${tenantId}.${secret}` — the tenant id is plain routing info (not secret),
 * embedded so a presented refresh token can be looked up with a normal tenant-scoped,
 * RLS-respecting query (packages/db's withTenantContext) instead of requiring a cross-tenant
 * lookup that would need to bypass Row-Level Security. Only `secret`'s hash is ever persisted.
 */
export function encodeRefreshToken(tenantId: string, secret: string): string {
  return `${tenantId}.${secret}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeRefreshToken(token: string): { tenantId: string; secret: string } {
  const idx = token.indexOf('.');
  const tenantId = idx === -1 ? '' : token.slice(0, idx);
  const secret = idx === -1 ? '' : token.slice(idx + 1);
  if (!UUID_RE.test(tenantId) || secret.length === 0) {
    throw new InvalidRefreshTokenError('Malformed refresh token');
  }
  return { tenantId, secret };
}

export function generateRefreshSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Refresh tokens are high-entropy random values (not user-chosen passwords), so a fast hash is
 * the accepted approach for at-rest storage — unlike password_hash, which uses argon2id.
 */
export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
