import { describe, expect, it } from 'vitest';
import { NoopSsoAssertionVerifier, SsoAuthenticationError } from './sso.js';

describe('NoopSsoAssertionVerifier', () => {
  it('always rejects an OIDC assertion — this is a fail-closed stub, not a real verifier', async () => {
    const verifier = new NoopSsoAssertionVerifier('oidc');
    await expect(
      verifier.verify({ id_token: 'whatever' }, { protocol: 'oidc', issuer: 'https://idp.example.com', clientId: 'abc', metadataUrl: null }),
    ).rejects.toBeInstanceOf(SsoAuthenticationError);
  });

  it('always rejects a SAML assertion too, regardless of input shape', async () => {
    const verifier = new NoopSsoAssertionVerifier('saml');
    await expect(
      verifier.verify('<samlp:Response>...</samlp:Response>', { protocol: 'saml', issuer: 'https://idp.example.com', clientId: null, metadataUrl: 'https://idp.example.com/metadata' }),
    ).rejects.toBeInstanceOf(SsoAuthenticationError);
  });

  it('rejects even undefined/empty input', async () => {
    const verifier = new NoopSsoAssertionVerifier('oidc');
    await expect(verifier.verify(undefined, { protocol: 'oidc', issuer: 'x', clientId: null, metadataUrl: null })).rejects.toBeInstanceOf(SsoAuthenticationError);
  });
});
