import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import { ValidationError, NotFoundError, ForbiddenError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import { OWNER_DB_CONNECTION, ENV_CONFIG } from '../common/tokens.js';

const LAUNCH_CONTEXT_TTL_MS = 5 * 60 * 1000;

/**
 * SMART launch's entry point, for both flows. Same bootstrapping problem `TokenService.issueToken`
 * already has — the browser lands here with only a `client_id`, before any tenant is known — so
 * this looks the client up the same way, over the owner/bootstrap connection.
 *
 * Standalone launch (no `launch` param): this is not itself where the patient authenticates or
 * consents — `apps/interop-fhir` is an API-only app with no session/cookie/UI concept (same
 * reasoning documented in the original client-credentials-only token.dto.ts comment, no longer
 * true once `apps/patient-portal` existed to build one). Once the request params check out, this
 * just 302s the browser to that app's own `/smart/authorize` page, forwarding every param
 * unchanged — the actual decision (and the `smart_authorization_codes` row it creates) happens
 * over there, via `@ehr/portal`'s `SmartLaunchService`, called through `apps/api` like every other
 * portal action.
 *
 * EHR launch (item 24, `launch` param present): the opposite direction — a clinician already
 * triggered this from inside a patient's chart (`apps/api`'s `POST .../smart-launch`, which minted
 * the `smart_launch_contexts` row this resolves), so context and authorization are already
 * settled. There is no patient/consent picker to redirect to; this mints the
 * `smart_authorization_codes` row directly and redirects straight back to the app's
 * `redirect_uri`, mirroring exactly what `SmartLaunchService.decide()` does for the standalone
 * flow's "approve" path, just without a human decision step in between.
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

    if (query.launch) {
      await this.handleEhrLaunch(query, client, res);
      return;
    }

    const target = new URL('/smart/authorize', this.env.PATIENT_PORTAL_BASE_URL);
    for (const [key, value] of Object.entries(query)) {
      target.searchParams.set(key, value);
    }
    res.status(302);
    res.header('Location', target.toString());
  }

  private async handleEhrLaunch(query: Record<string, string>, client: { client_id: string; tenant_id: string; allowed_scopes: string[] }, res: FastifyReply): Promise<void> {
    // Per the SMART App Launch spec, an EHR-launch request must echo `aud` back as the FHIR base
    // URL — a real cross-check that this authorization request is actually meant for this server.
    if (query.aud !== this.fhirBaseUrl()) {
      throw new ValidationError('aud must match this server’s FHIR base URL for an EHR launch', { aud: query.aud });
    }
    // `authorize()` already checked `query.launch`/`redirect_uri`/`code_challenge*` are present
    // before calling this method, but that narrowing doesn't cross the function boundary — these
    // locals re-assert it so TS (and a defensively re-checked runtime) both see plain strings.
    const launch = query.launch;
    const redirectUri = query.redirect_uri;
    const codeChallenge = query.code_challenge;
    const codeChallengeMethod = query.code_challenge_method;
    if (!launch || !redirectUri || !codeChallenge || !codeChallengeMethod) {
      throw new ValidationError('launch, redirect_uri, and PKCE parameters are required');
    }

    const context = await this.ownerDb
      .selectFrom('smart_launch_contexts')
      .selectAll()
      .where('id', '=', launch)
      .where('client_id', '=', client.client_id)
      .where('consumed_at', 'is', null)
      .executeTakeFirst();
    if (!context) throw new ForbiddenError('Invalid or already-used launch context');
    if (context.expires_at.getTime() < Date.now()) throw new ForbiddenError('Launch context has expired');

    const requestedScopes = (query.scope ?? '').split(' ').filter(Boolean);
    const disallowed = requestedScopes.filter((s) => !client.allowed_scopes.includes(s));
    if (disallowed.length > 0) {
      throw new ForbiddenError('Requested scope(s) are not permitted for this client', { disallowed });
    }

    // Single-use, mirroring how an authorization code is consumed at the token endpoint — a
    // retried/replayed `launch` value must not mint a second code.
    const consumed = await this.ownerDb
      .updateTable('smart_launch_contexts')
      .set({ consumed_at: new Date() })
      .where('id', '=', context.id)
      .where('consumed_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!consumed) throw new ForbiddenError('Launch context has already been used');

    const code = await this.ownerDb
      .insertInto('smart_authorization_codes')
      .values({
        tenant_id: context.tenant_id,
        client_id: client.client_id,
        patient_id: context.patient_id,
        encounter_id: context.encounter_id,
        launched_by_user_id: context.user_id,
        portal_account_id: null,
        scope: query.scope ?? '',
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        expires_at: new Date(Date.now() + LAUNCH_CONTEXT_TTL_MS),
        status: 'issued',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code.id);
    if (query.state) redirectUrl.searchParams.set('state', query.state);
    res.status(302);
    res.header('Location', redirectUrl.toString());
  }

  private fhirBaseUrl(): string {
    return `http://localhost:${this.env.INTEROP_FHIR_PORT}/fhir/r4`;
  }
}
