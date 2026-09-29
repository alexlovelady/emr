import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTVerifyGetKey, type KeyLike } from 'jose';
import { UnauthorizedError } from '@ehr/domain-common';
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

// Never surfaces past a route handler uncaught — the Fastify auth hooks that call
// verifyAccessToken() always catch it and leave the request unauthenticated instead — but it
// still extends UnauthorizedError for consistency with every other auth-failure error here.
export class InvalidAccessTokenError extends UnauthorizedError {}
export class InvalidRefreshTokenError extends UnauthorizedError {}

/** `jose`'s `jwtVerify` overloads dispatch on the STATIC type of its second argument, so a
 * `KeyLike | JWTVerifyGetKey` union can't be forwarded directly (TS can't tell which overload a
 * union matches). Normalizing to always call the `JWTVerifyGetKey` overload — wrapping a plain key
 * in a trivial lookup — sidesteps that without runtime branching. */
function asGetKey(key: KeyLike | JWTVerifyGetKey): JWTVerifyGetKey {
  return typeof key === 'function' ? key : (() => key) as JWTVerifyGetKey;
}

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

/** `publicKey` accepts either a single fixed key (every existing caller, unchanged) or a
 * `JWTVerifyGetKey` lookup keyed by the token's own `kid` header — what a rotation-aware caller
 * passes so a token signed by a since-retired (but still within its ring's retention window) key
 * keeps verifying. `jose`'s `jwtVerify` already natively dispatches on which form it receives. */
export async function verifyAccessToken(
  token: string,
  publicKey: KeyLike | JWTVerifyGetKey,
  config: Pick<TokenIssuerConfig, 'issuer' | 'audience'>,
): Promise<AccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, asGetKey(publicKey), {
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

export interface MfaPendingClaims {
  userId: string;
  tenantId: string;
}

const MFA_PENDING_AUDIENCE = 'ehr-mfa-pending';
const MFA_PENDING_TTL_SECONDS = 300;

/**
 * A short-lived, single-purpose token proving "this caller already presented a correct password
 * for this user" without yet proving MFA — issued by `login()` when `mfa_enrolled` is true, and
 * required by `POST /auth/mfa/challenge`. Deliberately a distinct audience from real access tokens
 * (`verifyAccessToken`'s strict audience check means this token can never be used as one), and a
 * distinct claims shape from `MfaChallengeSchema`'s old client-supplied-`userId` design — trusting a
 * raw client-supplied userId at the challenge step would let an attacker guess a TOTP code against
 * an arbitrary existing user without ever having proven that user's password.
 */
export async function signMfaPendingToken(claims: MfaPendingClaims, keys: KeyMaterial, issuer: string): Promise<string> {
  return new SignJWT({ tenant_id: claims.tenantId })
    .setProtectedHeader({ alg: JWT_ALG, kid: keys.kid })
    .setSubject(claims.userId)
    .setIssuer(issuer)
    .setAudience(MFA_PENDING_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MFA_PENDING_TTL_SECONDS}s`)
    .sign(keys.privateKey);
}

export async function verifyMfaPendingToken(token: string, publicKey: KeyLike | JWTVerifyGetKey, issuer: string): Promise<MfaPendingClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, asGetKey(publicKey), { issuer, audience: MFA_PENDING_AUDIENCE }));
  } catch (err) {
    throw new InvalidAccessTokenError(err instanceof Error ? err.message : String(err));
  }
  if (typeof payload.sub !== 'string' || typeof payload.tenant_id !== 'string') {
    throw new InvalidAccessTokenError('MFA pending token is missing required claims (sub, tenant_id)');
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
