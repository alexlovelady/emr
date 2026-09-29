import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { withSystemContext, withTenantContext } from '@ehr/db';
import type { ResolvedUser } from './identity-provider.js';
import { SsoAuthenticationError, type SsoAssertionVerifier, type SsoProtocol } from './sso.js';

/**
 * ADR-0002's SSO-readiness seam, realized: resolves "which local user is this federated login
 * for" without ever accepting or checking a password, the same split `IdentityProvider`'s own doc
 * comment describes. Deliberately a separate class rather than a second `IdentityProvider`
 * implementation — `resolveUser(tenantSlug, email)`'s signature assumes the caller already knows
 * the email up front (true for a password login form, not true for a federated callback, which
 * starts from an opaque provider-issued assertion) — everything downstream of identity resolution
 * (`issueTokens`, refresh, JWKS, MFA, key rotation) is already provider-agnostic and reused as-is
 * via the same `FirstPartyIdentityProvider` instance once this returns a `ResolvedUser`.
 *
 * Link-only, never provisioning: a federated login can only ever resolve to a `users` row that
 * already exists in this tenant (matched by the assertion's email on first login, then by the
 * persisted `external_identities` link on every login after). It never creates a new user or
 * grants any permission — an administrator must have already created the account through the
 * normal path, so enabling SSO for a tenant can never itself expand who can log in, only how.
 */
export class FederatedIdentityProvider {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly verifiers: Partial<Record<SsoProtocol, SsoAssertionVerifier>>,
  ) {}

  async authenticate(tenantSlug: string, protocol: SsoProtocol, rawAssertion: unknown): Promise<ResolvedUser> {
    const tenant = await withSystemContext(this.db, (trx) =>
      trx.selectFrom('tenants').select(['id']).where('slug', '=', tenantSlug).where('status', '=', 'active').executeTakeFirst(),
    );
    if (!tenant) throw new SsoAuthenticationError('SSO sign-in failed for this tenant');

    const config = await withTenantContext(this.db, tenant.id, (trx) =>
      trx
        .selectFrom('tenant_sso_configs')
        .select(['issuer', 'client_id', 'metadata_url'])
        .where('protocol', '=', protocol)
        .where('enabled', '=', true)
        .executeTakeFirst(),
    );
    if (!config) throw new SsoAuthenticationError('SSO sign-in failed for this tenant');

    const verifier = this.verifiers[protocol];
    if (!verifier) throw new SsoAuthenticationError('SSO sign-in failed for this tenant');

    // Every failure past this point is normalized to the same opaque message — same posture as
    // password login's "don't reveal whether the email exists" (see FirstPartyIdentityProvider):
    // a verifier's own rejection reason (invalid signature, expired assertion, no verifier
    // configured at all) must never leak to an unauthenticated caller which of those it was, or
    // even confirm that this tenant has SSO enabled in the first place.
    let assertion;
    try {
      assertion = await verifier.verify(rawAssertion, {
        protocol,
        issuer: config.issuer,
        clientId: config.client_id,
        metadataUrl: config.metadata_url,
      });
    } catch {
      throw new SsoAuthenticationError('SSO sign-in failed for this tenant');
    }

    return this.resolveOrLinkUser(tenant.id, protocol, assertion.externalSubjectId, assertion.email);
  }

  private async resolveOrLinkUser(tenantId: string, protocol: SsoProtocol, externalSubjectId: string, email: string): Promise<ResolvedUser> {
    return withTenantContext(this.db, tenantId, async (trx) => {
      const linked = await trx
        .selectFrom('external_identities')
        .innerJoin('users', 'users.id', 'external_identities.user_id')
        .select(['users.id as userId', 'users.status as status', 'users.mfa_enrolled as mfaEnrolled'])
        .where('external_identities.tenant_id', '=', tenantId)
        .where('external_identities.protocol', '=', protocol)
        .where('external_identities.external_subject_id', '=', externalSubjectId)
        .executeTakeFirst();
      if (linked) {
        if (linked.status !== 'active') throw new SsoAuthenticationError('SSO sign-in failed for this tenant');
        return { userId: linked.userId, tenantId, mfaEnrolled: linked.mfaEnrolled };
      }

      // First login for this external subject: link it to an existing active user by email —
      // never create one. No match means an admin hasn't provisioned this person locally yet.
      const user = await trx
        .selectFrom('users')
        .select(['id', 'mfa_enrolled'])
        .where('tenant_id', '=', tenantId)
        .where('email', '=', email)
        .where('status', '=', 'active')
        .executeTakeFirst();
      if (!user) throw new SsoAuthenticationError('SSO sign-in failed for this tenant');

      await trx
        .insertInto('external_identities')
        .values({
          tenant_id: tenantId,
          user_id: user.id,
          protocol,
          external_subject_id: externalSubjectId,
          status: 'active',
        })
        .execute();

      return { userId: user.id, tenantId, mfaEnrolled: user.mfa_enrolled };
    });
  }
}
