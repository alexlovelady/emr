import * as argon2 from 'argon2';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { ForbiddenError } from '@ehr/domain-common';
import { getCurrentKey, type KeyRingStore } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import { signSmartAccessToken } from './smart-token.js';
import { verifyPkce } from './pkce.js';
import type { TokenRequestInput, TokenResponse } from './token.dto.js';

export class TokenService {
  constructor(
    private readonly ownerDb: Kysely<DB>,
    private readonly keyRingStore: KeyRingStore,
    private readonly env: Pick<Env, 'JWT_ISSUER' | 'JWT_AUDIENCE' | 'ACCESS_TOKEN_TTL_SECONDS'>,
  ) {}

  async issueToken(input: TokenRequestInput): Promise<TokenResponse> {
    if (input.grant_type === 'authorization_code') {
      return this.issueTokenForAuthorizationCode(input);
    }
    return this.issueTokenForClientCredentials(input);
  }

  private async issueTokenForClientCredentials(
    input: Extract<TokenRequestInput, { grant_type: 'client_credentials' }>,
  ): Promise<TokenResponse> {
    const client = await this.ownerDb
      .selectFrom('smart_clients')
      .selectAll()
      .where('client_id', '=', input.client_id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!client) throw new ForbiddenError('Unknown SMART client');

    const validSecret = await argon2.verify(client.client_secret_hash, input.client_secret);
    if (!validSecret) throw new ForbiddenError('Invalid SMART client credentials');

    const requestedScopes = input.scope.split(' ').filter(Boolean);
    const grantedScopes = requestedScopes.filter((s) => client.allowed_scopes.includes(s));
    if (grantedScopes.length === 0) {
      throw new ForbiddenError('None of the requested scopes are permitted for this client', {
        requested: requestedScopes,
        allowed: client.allowed_scopes,
      });
    }

    const accessToken = await signSmartAccessToken(
      { tenantId: client.tenant_id, clientId: client.client_id, scope: grantedScopes },
      getCurrentKey(this.keyRingStore.get()),
      { issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, ttlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS },
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.env.ACCESS_TOKEN_TTL_SECONDS,
      scope: grantedScopes.join(' '),
    };
  }

  /**
   * The standalone-launch code exchange. The authorization code (a `smart_authorization_codes`
   * row id) was created by `@ehr/portal`'s `SmartLaunchService` once the patient consented — this
   * side only ever consumes it, never creates one, mirroring the split documented on
   * `AuthorizeController`.
   */
  private async issueTokenForAuthorizationCode(
    input: Extract<TokenRequestInput, { grant_type: 'authorization_code' }>,
  ): Promise<TokenResponse> {
    const code = await this.ownerDb
      .selectFrom('smart_authorization_codes')
      .selectAll()
      .where('id', '=', input.code)
      .where('status', '=', 'issued')
      .executeTakeFirst();
    if (!code) throw new ForbiddenError('Invalid or already-used authorization code');
    if (code.expires_at.getTime() < Date.now()) {
      throw new ForbiddenError('Authorization code has expired');
    }
    if (code.client_id !== input.client_id) {
      throw new ForbiddenError('Authorization code was not issued to this client');
    }
    if (code.redirect_uri !== input.redirect_uri) {
      throw new ForbiddenError('redirect_uri does not match the one used to obtain this code');
    }
    if (!verifyPkce(input.code_verifier, code.code_challenge)) {
      throw new ForbiddenError('Invalid PKCE code_verifier');
    }

    const client = await this.ownerDb
      .selectFrom('smart_clients')
      .selectAll()
      .where('client_id', '=', input.client_id)
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow();
    if (client.client_type === 'confidential') {
      if (!input.client_secret) throw new ForbiddenError('client_secret is required for a confidential client');
      const validSecret = await argon2.verify(client.client_secret_hash, input.client_secret);
      if (!validSecret) throw new ForbiddenError('Invalid SMART client credentials');
    }

    // Single-use: mark consumed before issuing the token so a retried/replayed exchange fails.
    const consumed = await this.ownerDb
      .updateTable('smart_authorization_codes')
      .set({ status: 'consumed', consumed_at: new Date() })
      .where('id', '=', code.id)
      .where('status', '=', 'issued')
      .returning('id')
      .executeTakeFirst();
    if (!consumed) throw new ForbiddenError('Authorization code has already been used');

    const scope = code.scope.split(' ').filter(Boolean);
    const accessToken = await signSmartAccessToken(
      { tenantId: code.tenant_id, clientId: client.client_id, scope, patientId: code.patient_id },
      getCurrentKey(this.keyRingStore.get()),
      { issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, ttlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS },
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.env.ACCESS_TOKEN_TTL_SECONDS,
      scope: code.scope,
      patient: code.patient_id,
    };
  }
}
