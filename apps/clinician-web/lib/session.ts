/**
 * Cookie names/options and the JWT `exp`-decode helper shared by middleware.ts and api-proxy.ts.
 * Decoding here is bookkeeping only — apps/api verifies the real signature on every call.
 */

export const ACCESS_TOKEN_COOKIE = 'ehr_access_token';
export const REFRESH_TOKEN_COOKIE = 'ehr_refresh_token';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

/** Base64url-decodes a JWT's payload and returns its `exp` (seconds since epoch), or null if unparseable. */
export function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True if the token is missing, unparseable, or expires within `skewSeconds` (default 30s). */
export function isExpiredOrExpiringSoon(token: string | undefined, skewSeconds = 30): boolean {
  if (!token) return true;
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  return exp * 1000 <= Date.now() + skewSeconds * 1000;
}
