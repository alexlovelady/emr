import * as argon2 from 'argon2';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { ForbiddenError } from '@ehr/domain-common';
import type { KeyMaterial } from '@ehr/auth-adapter';
import type { Env } from '@ehr/config';
import { signSmartAccessToken } from './smart-token.js';
import type { TokenRequestInput, TokenResponse } from './token.dto.js';

export class TokenService {
  constructor(
    private readonly ownerDb: Kysely<DB>,
    private readonly keys: KeyMaterial,
    private readonly env: Pick<Env, 'JWT_ISSUER' | 'JWT_AUDIENCE' | 'ACCESS_TOKEN_TTL_SECONDS'>,
  ) {}

  async issueToken(input: TokenRequestInput): Promise<TokenResponse> {
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
      this.keys,
      { issuer: this.env.JWT_ISSUER, audience: this.env.JWT_AUDIENCE, ttlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS },
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.env.ACCESS_TOKEN_TTL_SECONDS,
      scope: grantedScopes.join(' '),
    };
  }
}
