import { jwtVerify, SignJWT, type JWTVerifyGetKey, type KeyLike } from 'jose';
import { JWT_ALG, type KeyMaterial } from '@ehr/auth-adapter';

/** Same reasoning as `@ehr/auth-adapter`'s own `asGetKey` — TS overload resolution can't dispatch
 * on a `KeyLike | JWTVerifyGetKey` union directly. */
function asGetKey(key: KeyLike | JWTVerifyGetKey): JWTVerifyGetKey {
  return typeof key === 'function' ? key : (() => key) as JWTVerifyGetKey;
}

export interface SmartTokenConfig {
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export interface SmartTokenClaims {
  tenantId: string;
  clientId: string;
  scope: string[];
  /** SMART launch context — set only for a token issued via the authorization_code grant. */
  patientId?: string;
  /** SMART's optional `encounter` launch context (item 24, EHR launch only — standalone launch
   * never has an encounter since the patient picks their own chart with no visit in progress). */
  encounterId?: string;
}

export class InvalidSmartTokenError extends Error {}

/**
 * A dedicated signer for SMART client-credentials tokens (`sub` = client id, plus a `scope`
 * claim) — deliberately separate from `@ehr/auth-adapter`'s `signAccessToken`/`verifyAccessToken`
 * (staff-user tokens have no `scope` claim and a different `sub` meaning) rather than overloading
 * that shared claims contract. Both token kinds are signed with the same ES256 key material, so
 * the one published JWKS endpoint (`apps/api`'s `/.well-known/jwks.json`) verifies either.
 */
export async function signSmartAccessToken(claims: SmartTokenClaims, keys: KeyMaterial, config: SmartTokenConfig): Promise<string> {
  return new SignJWT({
    tenant_id: claims.tenantId,
    scope: claims.scope.join(' '),
    ...(claims.patientId ? { patient: claims.patientId } : {}),
    ...(claims.encounterId ? { encounter: claims.encounterId } : {}),
  })
    .setProtectedHeader({ alg: JWT_ALG, kid: keys.kid })
    .setSubject(claims.clientId)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${config.ttlSeconds}s`)
    .sign(keys.privateKey);
}

export async function verifySmartAccessToken(
  token: string,
  publicKey: KeyMaterial['publicKey'] | JWTVerifyGetKey,
  config: Pick<SmartTokenConfig, 'issuer' | 'audience'>,
): Promise<SmartTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, asGetKey(publicKey), { issuer: config.issuer, audience: config.audience }));
  } catch (err) {
    throw new InvalidSmartTokenError(err instanceof Error ? err.message : String(err));
  }
  if (typeof payload.sub !== 'string' || typeof payload.tenant_id !== 'string' || typeof payload.scope !== 'string') {
    throw new InvalidSmartTokenError('SMART access token is missing required claims (sub, tenant_id, scope)');
  }
  return {
    clientId: payload.sub,
    tenantId: payload.tenant_id,
    scope: payload.scope.split(' ').filter(Boolean),
    ...(typeof payload.patient === 'string' ? { patientId: payload.patient } : {}),
    ...(typeof payload.encounter === 'string' ? { encounterId: payload.encounter } : {}),
  };
}
