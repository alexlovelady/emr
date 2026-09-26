import { generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JWT_ALG, type KeyMaterial } from './keys.js';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  generateRefreshSecret,
  hashRefreshSecret,
  InvalidAccessTokenError,
  InvalidRefreshTokenError,
  signAccessToken,
  verifyAccessToken,
  type TokenIssuerConfig,
} from './tokens.js';

const config: TokenIssuerConfig = { issuer: 'ehr-test', audience: 'ehr-api', accessTokenTtlSeconds: 900 };
let keys: KeyMaterial;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair(JWT_ALG, { extractable: true });
  keys = { privateKey, publicKey, kid: 'test-kid' };
});

describe('access tokens', () => {
  it('round-trips a signed token through verifyAccessToken', async () => {
    const token = await signAccessToken({ userId: 'u1', tenantId: 't1' }, keys, config);
    const claims = await verifyAccessToken(token, keys.publicKey, config);
    expect(claims).toEqual({ userId: 'u1', tenantId: 't1' });
  });

  it('rejects a token signed for a different audience', async () => {
    const token = await signAccessToken({ userId: 'u1', tenantId: 't1' }, keys, config);
    await expect(
      verifyAccessToken(token, keys.publicKey, { ...config, audience: 'someone-else' }),
    ).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('rejects a token verified with the wrong public key', async () => {
    const token = await signAccessToken({ userId: 'u1', tenantId: 't1' }, keys, config);
    const { publicKey: otherKey } = await generateKeyPair(JWT_ALG, { extractable: true });
    await expect(verifyAccessToken(token, otherKey, config)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('rejects an already-expired token', async () => {
    const token = await signAccessToken({ userId: 'u1', tenantId: 't1' }, keys, {
      ...config,
      accessTokenTtlSeconds: -10,
    });
    await expect(verifyAccessToken(token, keys.publicKey, config)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});

describe('refresh token encoding', () => {
  it('round-trips tenantId/secret through encode/decode', () => {
    const secret = generateRefreshSecret();
    const encoded = encodeRefreshToken('11111111-1111-1111-1111-111111111111', secret);
    expect(decodeRefreshToken(encoded)).toEqual({ tenantId: '11111111-1111-1111-1111-111111111111', secret });
  });

  it('rejects a token with no tenant prefix', () => {
    expect(() => decodeRefreshToken('not-a-valid-token')).toThrow(InvalidRefreshTokenError);
  });

  it('rejects a token with a malformed (non-UUID) tenant segment', () => {
    expect(() => decodeRefreshToken('not-a-uuid.somesecret')).toThrow(InvalidRefreshTokenError);
  });

  it('hashRefreshSecret is deterministic and does not equal the input', () => {
    const secret = generateRefreshSecret();
    expect(hashRefreshSecret(secret)).toBe(hashRefreshSecret(secret));
    expect(hashRefreshSecret(secret)).not.toBe(secret);
  });
});
