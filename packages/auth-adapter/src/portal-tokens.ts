import { jwtVerify, SignJWT, type JWTVerifyGetKey, type KeyLike } from 'jose';
import { UnauthorizedError } from '@ehr/domain-common';
import { JWT_ALG, type KeyMaterial } from './keys.js';

/** Same reasoning as `tokens.ts`'s own `asGetKey` — TS overload resolution can't dispatch on a
 * `KeyLike | JWTVerifyGetKey` union directly. */
function asGetKey(key: KeyLike | JWTVerifyGetKey): JWTVerifyGetKey {
  return typeof key === 'function' ? key : (() => key) as JWTVerifyGetKey;
}

export interface PortalTokenIssuerConfig {
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

export interface PortalAccessTokenClaims {
  portalAccountId: string;
  tenantId: string;
}

// Never surfaces past a route handler uncaught — apps/api's portal-context.hook.ts always
// catches it and leaves the request unauthenticated instead — but it still extends
// UnauthorizedError for consistency with every other auth-failure error here.
export class InvalidPortalTokenError extends UnauthorizedError {}

/**
 * Deliberately separate from `tokens.ts`'s `signAccessToken`/`verifyAccessToken` rather than
 * overloading that shared staff claims contract (`userId`) — the same reasoning
 * `apps/interop-fhir/src/token/smart-token.ts` already documented for SMART tokens. Both token
 * kinds are signed with the same `KeyMaterial`/ES256 key, so the one published JWKS endpoint
 * verifies either — but a staff access token can never be replayed on a portal route (or vice
 * versa) because the `aud` claim differs and `jwtVerify` rejects an audience mismatch outright.
 */
export async function signPortalAccessToken(
  claims: PortalAccessTokenClaims,
  keys: KeyMaterial,
  config: PortalTokenIssuerConfig,
): Promise<string> {
  return new SignJWT({ tenant_id: claims.tenantId })
    .setProtectedHeader({ alg: JWT_ALG, kid: keys.kid })
    .setSubject(claims.portalAccountId)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(keys.privateKey);
}

export async function verifyPortalAccessToken(
  token: string,
  publicKey: KeyLike | JWTVerifyGetKey,
  config: Pick<PortalTokenIssuerConfig, 'issuer' | 'audience'>,
): Promise<PortalAccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, asGetKey(publicKey), {
      issuer: config.issuer,
      audience: config.audience,
    }));
  } catch (err) {
    throw new InvalidPortalTokenError(err instanceof Error ? err.message : String(err));
  }

  if (typeof payload.sub !== 'string' || typeof payload.tenant_id !== 'string') {
    throw new InvalidPortalTokenError('Portal token is missing required claims (sub, tenant_id)');
  }
  return { portalAccountId: payload.sub, tenantId: payload.tenant_id };
}
