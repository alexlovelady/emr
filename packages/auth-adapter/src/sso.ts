import { UnauthorizedError } from '@ehr/domain-common';

export type SsoProtocol = 'oidc' | 'saml';

export interface TenantSsoConfig {
  protocol: SsoProtocol;
  issuer: string;
  clientId: string | null;
  metadataUrl: string | null;
}

/**
 * What a real OIDC id_token or SAML assertion resolves to, once cryptographically verified
 * against the identity provider's own signing keys/certificate. `externalSubjectId` is whatever
 * stable identifier the assertion carries (an OIDC `sub` claim, a SAML NameID) — opaque here.
 */
export interface VerifiedSsoAssertion {
  externalSubjectId: string;
  email: string;
  displayName?: string;
}

/** Same opaque-failure posture as `InvalidCredentialsError` on the password path — a federated
 * login failure (unconfigured tenant, disabled config, rejected assertion, no matching local
 * account) never reveals which of those it was. */
export class SsoAuthenticationError extends UnauthorizedError {}

/**
 * Verifies a raw, protocol-specific assertion (an OIDC authorization-code exchange result, a SAML
 * Response document) against a tenant's configured IdP and returns the identity it proves —
 * without this, nothing else in the federated login path can be trusted.
 */
export interface SsoAssertionVerifier {
  readonly protocol: SsoProtocol;
  verify(rawAssertion: unknown, config: TenantSsoConfig): Promise<VerifiedSsoAssertion>;
}

/**
 * ADR-0002 tracks external identity federation (SSO/SAML/OIDC) as a deliberately deferred vendor
 * integration — no real IdP is connected in this environment, and none can be without choosing
 * and contracting one. Unlike this codebase's other `Noop*Gateway` stubs (which return an
 * empty/successful result so a downstream flow can be demoed, e.g. `NoopPaymentGateway` always
 * succeeding), an identity verifier that trivially "succeeded" would let anyone log in as anyone
 * it named — so this ALWAYS REJECTS, fail-closed, regardless of input.
 *
 * It exists to prove the request path (tenant SSO config lookup -> verifier call -> JIT link to an
 * existing local user -> ordinary token issuance) is real and fully wired, not to actually
 * authenticate anyone. `FederatedIdentityProvider.authenticate()` cannot succeed until a real
 * verifier (one that validates a real signed SAML response or OIDC id_token against the IdP's own
 * published keys) replaces this class for a given protocol.
 */
export class NoopSsoAssertionVerifier implements SsoAssertionVerifier {
  constructor(readonly protocol: SsoProtocol) {}

  async verify(_rawAssertion: unknown, _config: TenantSsoConfig): Promise<VerifiedSsoAssertion> {
    throw new SsoAuthenticationError('SSO sign-in is not available: no identity-provider verifier is configured in this environment');
  }
}
