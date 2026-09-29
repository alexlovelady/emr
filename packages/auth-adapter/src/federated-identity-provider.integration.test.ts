import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedSyntheticFixtures, withTenantContext, type DB, type SeedResult } from '@ehr/db';
import { FederatedIdentityProvider } from './federated-identity-provider.js';
import { TenantSsoConfigRepository } from './sso-config.repository.js';
import { SsoAuthenticationError, type SsoAssertionVerifier, type VerifiedSsoAssertion } from './sso.js';

/** Always resolves to the given assertion, regardless of the raw input or config — a fake, not
 * `NoopSsoAssertionVerifier`, since these tests exercise the JIT-link mechanism itself, which
 * requires a verifier that actually succeeds. */
class FakeSsoAssertionVerifier implements SsoAssertionVerifier {
  readonly protocol = 'oidc' as const;
  constructor(private readonly assertion: VerifiedSsoAssertion) {}
  async verify(): Promise<VerifiedSsoAssertion> {
    return this.assertion;
  }
}

/** Requires a live Postgres with migrations applied — run via `pnpm test:integration`. Config
 * writes go through `withTenantContext` (like every other RLS-enforced-table test in this repo —
 * see `packages/authz/src/layers/contextual-layers.integration.test.ts`) since `tenant_sso_configs`/
 * `external_identities` enforce Row-Level Security against the `ehr_app` connection; only
 * `FederatedIdentityProvider.authenticate()` itself is called with the raw `appDb`, since it opens
 * its own tenant context internally (it must — it runs before any tenant is known). */
describe('FederatedIdentityProvider (integration)', () => {
  let ownerDb: Kysely<DB>;
  let appDb: Kysely<DB>;
  let seed: SeedResult;
  const configRepo = new TenantSsoConfigRepository();

  beforeAll(async () => {
    ownerDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    seed = await seedSyntheticFixtures(ownerDb);
    appDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.APP_DATABASE_URL }) }) });
  });

  afterAll(async () => {
    await ownerDb.deleteFrom('external_identities').where('tenant_id', 'in', [seed.tenantA.tenantId, seed.tenantB.tenantId]).execute();
    await ownerDb.deleteFrom('tenant_sso_configs').where('tenant_id', 'in', [seed.tenantA.tenantId, seed.tenantB.tenantId]).execute();
    await ownerDb.destroy();
    await appDb.destroy();
  });

  it('rejects when the tenant has no SSO config at all', async () => {
    const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-1', email: seed.tenantA.adminEmail }) });
    await expect(provider.authenticate(seed.tenantA.slug, 'oidc', {})).rejects.toBeInstanceOf(SsoAuthenticationError);
  });

  it('rejects when a config exists but is disabled', async () => {
    await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
      configRepo.upsert(trx, seed.tenantA.tenantId, { protocol: 'oidc', enabled: false, issuer: 'https://idp.example.com', clientId: 'client-a', metadataUrl: null }, seed.tenantA.adminUserId),
    );
    const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-1', email: seed.tenantA.adminEmail }) });
    await expect(provider.authenticate(seed.tenantA.slug, 'oidc', {})).rejects.toBeInstanceOf(SsoAuthenticationError);
  });

  it('rejects when no protocol verifier is registered for an enabled config', async () => {
    await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
      configRepo.upsert(trx, seed.tenantA.tenantId, { protocol: 'saml', enabled: true, issuer: 'https://idp.example.com', clientId: null, metadataUrl: 'https://idp.example.com/metadata' }, seed.tenantA.adminUserId),
    );
    const provider = new FederatedIdentityProvider(appDb, {}); // no verifiers registered at all
    await expect(provider.authenticate(seed.tenantA.slug, 'saml', {})).rejects.toBeInstanceOf(SsoAuthenticationError);
  });

  describe('with an enabled OIDC config', () => {
    beforeAll(async () => {
      await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        configRepo.upsert(trx, seed.tenantA.tenantId, { protocol: 'oidc', enabled: true, issuer: 'https://idp.example.com', clientId: 'client-a', metadataUrl: null }, seed.tenantA.adminUserId),
      );
    });

    it('rejects an assertion whose email matches no active local user in the tenant', async () => {
      const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-nobody', email: 'nobody@example.com' }) });
      await expect(provider.authenticate(seed.tenantA.slug, 'oidc', {})).rejects.toBeInstanceOf(SsoAuthenticationError);
    });

    it('JIT-links a first-time assertion to the matching local user by email, and resolves it', async () => {
      const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-admin-a', email: seed.tenantA.adminEmail }) });
      const result = await provider.authenticate(seed.tenantA.slug, 'oidc', {});
      expect(result).toEqual({ userId: seed.tenantA.adminUserId, tenantId: seed.tenantA.tenantId, mfaEnrolled: false });

      const link = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        trx.selectFrom('external_identities').selectAll().where('external_subject_id', '=', 'sub-admin-a').executeTakeFirst(),
      );
      expect(link?.user_id).toBe(seed.tenantA.adminUserId);
    });

    it('reuses the existing link on a subsequent login instead of creating a duplicate', async () => {
      const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-admin-a', email: seed.tenantA.adminEmail }) });
      const result = await provider.authenticate(seed.tenantA.slug, 'oidc', {});
      expect(result.userId).toBe(seed.tenantA.adminUserId);

      const links = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        trx.selectFrom('external_identities').selectAll().where('external_subject_id', '=', 'sub-admin-a').execute(),
      );
      expect(links).toHaveLength(1);
    });

    it('never lets a config enabled for tenant A authenticate against tenant B', async () => {
      const provider = new FederatedIdentityProvider(appDb, { oidc: new FakeSsoAssertionVerifier({ externalSubjectId: 'sub-cross-tenant', email: seed.tenantB.adminEmail }) });
      await expect(provider.authenticate(seed.tenantB.slug, 'oidc', {})).rejects.toBeInstanceOf(SsoAuthenticationError);
    });
  });
});

describe('TenantSsoConfigRepository (integration)', () => {
  let ownerDb: Kysely<DB>;
  let appDb: Kysely<DB>;
  let seed: SeedResult;
  const repo = new TenantSsoConfigRepository();

  beforeAll(async () => {
    ownerDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    seed = await seedSyntheticFixtures(ownerDb);
    appDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.APP_DATABASE_URL }) }) });
  });

  afterAll(async () => {
    await ownerDb.deleteFrom('tenant_sso_configs').where('tenant_id', '=', seed.tenantB.tenantId).execute();
    await ownerDb.destroy();
    await appDb.destroy();
  });

  it('returns null when no config exists yet', async () => {
    const found = await withTenantContext(appDb, seed.tenantB.tenantId, (trx) => repo.get(trx, seed.tenantB.tenantId));
    expect(found).toBeNull();
  });

  it('upsert creates, then a second upsert replaces the same row rather than creating a second one', async () => {
    const created = await withTenantContext(appDb, seed.tenantB.tenantId, (trx) =>
      repo.upsert(trx, seed.tenantB.tenantId, { protocol: 'oidc', enabled: false, issuer: 'https://idp-1.example.com', clientId: 'c1', metadataUrl: null }, seed.tenantB.adminUserId),
    );
    expect(created.protocol).toBe('oidc');
    expect(created.enabled).toBe(false);

    const replaced = await withTenantContext(appDb, seed.tenantB.tenantId, (trx) =>
      repo.upsert(trx, seed.tenantB.tenantId, { protocol: 'saml', enabled: true, issuer: 'https://idp-2.example.com', clientId: null, metadataUrl: 'https://idp-2.example.com/metadata' }, seed.tenantB.adminUserId),
    );
    expect(replaced.id).toBe(created.id);
    expect(replaced.protocol).toBe('saml');
    expect(replaced.enabled).toBe(true);

    const fetched = await withTenantContext(appDb, seed.tenantB.tenantId, (trx) => repo.get(trx, seed.tenantB.tenantId));
    expect(fetched).toMatchObject({ protocol: 'saml', enabled: true, issuer: 'https://idp-2.example.com' });
  });
});
