import { jwtVerify, SignJWT, type KeyLike } from 'jose';
import { JWT_ALG, type KeyMaterial } from './keys.js';

export interface PortalTokenIssuerConfig {
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

export interface PortalAccessTokenClaims {
  portalAccountId: string;
  tenantId: string;
}

export class InvalidPortalTokenError extends Error {}

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
  publicKey: KeyLike,
  config: Pick<PortalTokenIssuerConfig, 'issuer' | 'audience'>,
): Promise<PortalAccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, publicKey, {
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
