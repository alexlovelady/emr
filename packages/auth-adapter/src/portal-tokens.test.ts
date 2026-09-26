import { generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JWT_ALG, type KeyMaterial } from './keys.js';
import { signAccessToken, type TokenIssuerConfig } from './tokens.js';
import {
  InvalidPortalTokenError,
  signPortalAccessToken,
  verifyPortalAccessToken,
  type PortalTokenIssuerConfig,
} from './portal-tokens.js';

const config: PortalTokenIssuerConfig = { issuer: 'ehr-test', audience: 'ehr-portal', accessTokenTtlSeconds: 900 };
let keys: KeyMaterial;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair(JWT_ALG, { extractable: true });
  keys = { privateKey, publicKey, kid: 'test-kid' };
});

describe('portal access tokens', () => {
  it('round-trips a signed token through verifyPortalAccessToken', async () => {
    const token = await signPortalAccessToken({ portalAccountId: 'pa1', tenantId: 't1' }, keys, config);
    const claims = await verifyPortalAccessToken(token, keys.publicKey, config);
    expect(claims).toEqual({ portalAccountId: 'pa1', tenantId: 't1' });
  });

  it('rejects a token signed for a different audience', async () => {
    const token = await signPortalAccessToken({ portalAccountId: 'pa1', tenantId: 't1' }, keys, config);
    await expect(
      verifyPortalAccessToken(token, keys.publicKey, { ...config, audience: 'someone-else' }),
    ).rejects.toBeInstanceOf(InvalidPortalTokenError);
  });

  it('rejects a token verified with the wrong public key', async () => {
    const token = await signPortalAccessToken({ portalAccountId: 'pa1', tenantId: 't1' }, keys, config);
    const { publicKey: otherKey } = await generateKeyPair(JWT_ALG, { extractable: true });
    await expect(verifyPortalAccessToken(token, otherKey, config)).rejects.toBeInstanceOf(InvalidPortalTokenError);
  });

  it('rejects an already-expired token', async () => {
    const token = await signPortalAccessToken({ portalAccountId: 'pa1', tenantId: 't1' }, keys, {
      ...config,
      accessTokenTtlSeconds: -10,
    });
    await expect(verifyPortalAccessToken(token, keys.publicKey, config)).rejects.toBeInstanceOf(InvalidPortalTokenError);
  });

  /**
   * The whole point of a separate audience: a staff access token must never verify as a portal
   * token, even though both are signed with the exact same key material — and vice versa.
   */
  it('a staff access token is rejected by verifyPortalAccessToken, even with the same signing key', async () => {
    const staffConfig: TokenIssuerConfig = { issuer: 'ehr-test', audience: 'ehr-api', accessTokenTtlSeconds: 900 };
    const staffToken = await signAccessToken({ userId: 'u1', tenantId: 't1' }, keys, staffConfig);
    await expect(verifyPortalAccessToken(staffToken, keys.publicKey, config)).rejects.toBeInstanceOf(InvalidPortalTokenError);
  });
});
