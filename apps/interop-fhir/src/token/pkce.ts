import { createHash } from 'node:crypto';

/** RFC 7636 S256: base64url(sha256(code_verifier)) === code_challenge. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}
