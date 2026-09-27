import { generateKeyPair } from 'jose';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedSyntheticFixtures, DEV_PASSWORD, type DB, type SeedResult } from '@ehr/db';
import { JWT_ALG, type KeyMaterial } from './keys.js';
import { authenticator } from 'otplib';
import { FirstPartyIdentityProvider, InvalidCredentialsError, InvalidMfaCodeError } from './identity-provider.js';
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

  it('resolves a seeded user and confirms their password', async () => {
    const result = await provider.resolveUser(seed.tenantA.slug, seed.tenantA.adminEmail);
    expect(result).toEqual({ userId: seed.tenantA.adminUserId, tenantId: seed.tenantA.tenantId, mfaEnrolled: false });
    expect(await provider.checkPassword(result.userId, result.tenantId, DEV_PASSWORD)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const result = await provider.resolveUser(seed.tenantA.slug, seed.tenantA.adminEmail);
    expect(await provider.checkPassword(result.userId, result.tenantId, 'wrong-password')).toBe(false);
  });

  it('rejects an unknown tenant slug', async () => {
    await expect(
      provider.resolveUser('no-such-tenant', seed.tenantA.adminEmail),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects a real email under the wrong tenant', async () => {
    await expect(
      provider.resolveUser(seed.tenantB.slug, seed.tenantA.adminEmail),
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

  describe('MFA enrollment and challenge', () => {
    // upsertUser() (packages/db's seed-fixtures.ts) only overwrites password_hash on conflict, so
    // the mfa_* columns this test flips on the seeded staff user would otherwise persist across
    // runs against the same dev database — reset them so the test is repeatable, not just once-green.
    afterAll(async () => {
      await ownerDb
        .updateTable('users')
        .set({ mfa_enrolled: false, mfa_method: 'none', mfa_secret: null })
        .where('id', '=', seed.tenantA.staffUserId)
        .execute();
    });

    it('walks the full enroll -> confirm -> challenge lifecycle', async () => {
      const before = await provider.resolveUser(seed.tenantA.slug, seed.tenantA.staffEmail);
      expect(before.mfaEnrolled).toBe(false);

      const enrollment = await provider.startMfaEnrollment(seed.tenantA.staffUserId, seed.tenantA.tenantId, seed.tenantA.staffEmail);
      expect(enrollment.otpauthUrl).toContain(enrollment.secret);

      // Not yet confirmed — verifyMfaChallenge must not accept a correct code before confirmation.
      const codeBeforeConfirm = authenticator.generate(enrollment.secret);
      expect(await provider.verifyMfaChallenge(seed.tenantA.staffUserId, seed.tenantA.tenantId, codeBeforeConfirm)).toBe(false);

      await expect(
        provider.confirmMfaEnrollment(seed.tenantA.staffUserId, seed.tenantA.tenantId, '000000'),
      ).rejects.toBeInstanceOf(InvalidMfaCodeError);

      await provider.confirmMfaEnrollment(seed.tenantA.staffUserId, seed.tenantA.tenantId, authenticator.generate(enrollment.secret));

      const after = await provider.resolveUser(seed.tenantA.slug, seed.tenantA.staffEmail);
      expect(after.mfaEnrolled).toBe(true);

      expect(await provider.verifyMfaChallenge(seed.tenantA.staffUserId, seed.tenantA.tenantId, '000000')).toBe(false);
      expect(
        await provider.verifyMfaChallenge(seed.tenantA.staffUserId, seed.tenantA.tenantId, authenticator.generate(enrollment.secret)),
      ).toBe(true);
    });

    it('issueMfaPendingToken/verifyMfaPendingToken round-trip the userId/tenantId', async () => {
      const token = await provider.issueMfaPendingToken(seed.tenantA.adminUserId, seed.tenantA.tenantId);
      const claims = await provider.verifyMfaPendingToken(token);
      expect(claims).toEqual({ userId: seed.tenantA.adminUserId, tenantId: seed.tenantA.tenantId });
    });
  });
});
