import { generateKeyPair } from 'jose';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedSyntheticFixtures, DEV_PASSWORD, type DB, type SeedResult } from '@ehr/db';
import { JWT_ALG, type KeyMaterial } from './keys.js';
import { FirstPartyIdentityProvider, InvalidCredentialsError } from './identity-provider.js';
import { InvalidRefreshTokenError, verifyAccessToken } from './tokens.js';

/** Requires a live Postgres with migrations applied — run via `pnpm test:integration`. */
describe('FirstPartyIdentityProvider (integration)', () => {
  let ownerDb: Kysely<DB>;
  let appDb: Kysely<DB>;
  let seed: SeedResult;
  let provider: FirstPartyIdentityProvider;
  let keys: KeyMaterial;

  beforeAll(async () => {
    // Seeding needs the owner/bootstrap role (DATABASE_URL) — it writes across two tenants in
    // one run, which the RLS-enforcing ehr_app role's per-tenant policies would reject.
    ownerDb = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }),
    });
    seed = await seedSyntheticFixtures(ownerDb);

    // The provider itself MUST be tested against the same role apps/api actually uses
    // (APP_DATABASE_URL / ehr_app) — connecting as the owner would bypass Row-Level Security
    // entirely and silently pass even a broken cross-tenant query, proving nothing.
    appDb = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.APP_DATABASE_URL }) }),
    });

    const { privateKey, publicKey } = await generateKeyPair(JWT_ALG, { extractable: true });
    keys = { privateKey, publicKey, kid: 'test-kid' };
    provider = new FirstPartyIdentityProvider(appDb, keys, {
      issuer: 'ehr-test',
      audience: 'ehr-api',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 1_209_600,
    });
  });

  afterAll(async () => {
    await ownerDb.destroy();
    await appDb.destroy();
  });

  it('verifies correct credentials for a seeded user', async () => {
    const result = await provider.verifyCredentials(seed.tenantA.slug, seed.tenantA.adminEmail, DEV_PASSWORD);
    expect(result).toEqual({ userId: seed.tenantA.adminUserId, tenantId: seed.tenantA.tenantId });
  });

  it('rejects the wrong password', async () => {
    await expect(
      provider.verifyCredentials(seed.tenantA.slug, seed.tenantA.adminEmail, 'wrong-password'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects an unknown tenant slug', async () => {
    await expect(
      provider.verifyCredentials('no-such-tenant', seed.tenantA.adminEmail, DEV_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects a real email under the wrong tenant', async () => {
    await expect(
      provider.verifyCredentials(seed.tenantB.slug, seed.tenantA.adminEmail, DEV_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('issues a working access token and a rotating refresh token', async () => {
    const pair1 = await provider.issueTokens(seed.tenantA.adminUserId, seed.tenantA.tenantId);
    const claims = await verifyAccessToken(pair1.accessToken, keys.publicKey, {
      issuer: 'ehr-test',
      audience: 'ehr-api',
    });
    expect(claims).toEqual({ userId: seed.tenantA.adminUserId, tenantId: seed.tenantA.tenantId });

    const pair2 = await provider.refresh(pair1.refreshToken);
    expect(pair2.refreshToken).not.toBe(pair1.refreshToken);

    // The rotated-out token must no longer work.
    await expect(provider.refresh(pair1.refreshToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    // The new token still works.
    const pair3 = await provider.refresh(pair2.refreshToken);
    expect(pair3.accessToken).toBeTypeOf('string');
  });

  it('revoke() makes a refresh token unusable', async () => {
    const pair = await provider.issueTokens(seed.tenantA.staffUserId, seed.tenantA.tenantId);
    await provider.revoke(pair.refreshToken);
    await expect(provider.refresh(pair.refreshToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('getJWKS() exposes the public key with the expected kid', async () => {
    const jwks = await provider.getJWKS();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kid: keys.kid, use: 'sig', alg: 'ES256' });
  });
});
