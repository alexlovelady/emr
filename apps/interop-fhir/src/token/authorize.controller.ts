import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { ValidationError, NotFoundError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import { OWNER_DB_CONNECTION, ENV_CONFIG } from '../common/tokens.js';

/**
 * SMART standalone launch's entry point. Same bootstrapping problem `TokenService.issueToken`
 * already has — the browser lands here with only a `client_id`, before any tenant is known — so
 * this looks the client up the same way, over the owner/bootstrap connection.
 *
 * This is not itself where the patient authenticates or consents: `apps/interop-fhir` is an
 * API-only app with no session/cookie/UI concept (same reasoning documented in the original
 * client-credentials-only token.dto.ts comment, no longer true once `apps/patient-portal` existed
 * to build one). Once the request params check out, this just 302s the browser to that app's own
 * `/smart/authorize` page, forwarding every param unchanged — the actual decision (and the
 * `smart_authorization_codes` row it creates) happens over there, via `@ehr/portal`'s
 * `SmartLaunchService`, called through `apps/api` like every other portal action.
 */
@Controller('fhir/r4')
export class AuthorizeController {
  constructor(
    @Inject(OWNER_DB_CONNECTION) private readonly ownerDb: Kysely<DB>,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  @Get('authorize')
  async authorize(@Query() query: Record<string, string>, @Res({ passthrough: true }) res: FastifyReply): Promise<void> {
    if (query.response_type !== 'code') {
      throw new ValidationError('Only response_type=code is supported');
    }
    if (!query.client_id) throw new ValidationError('client_id is required');
    if (!query.redirect_uri) throw new ValidationError('redirect_uri is required');
    if (query.code_challenge_method !== 'S256' || !query.code_challenge) {
      throw new ValidationError('PKCE with code_challenge_method=S256 is required');
    }

    const client = await this.ownerDb
      .selectFrom('smart_clients')
      .selectAll()
      .where('client_id', '=', query.client_id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!client) throw new NotFoundError('Unknown SMART client', { clientId: query.client_id });
    if (!client.redirect_uris.includes(query.redirect_uri)) {
      throw new ValidationError('redirect_uri is not registered for this client', { redirectUri: query.redirect_uri });
    }

    const target = new URL('/smart/authorize', this.env.PATIENT_PORTAL_BASE_URL);
    for (const [key, value] of Object.entries(query)) {
      target.searchParams.set(key, value);
    }
    res.status(302);
    res.header('Location', target.toString());
  }
}
