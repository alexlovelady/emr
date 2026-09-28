import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ForbiddenError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import type { SmartAuthorizeDecisionInput, SmartAuthorizeDecisionResult } from './smart-launch.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;
type PortalRequestContext = RequestContext & { actor: { id: string; type: 'patient' } };

const CODE_TTL_MS = 10 * 60 * 1000;

export interface SmartClientInfo {
  clientId: string;
  displayName: string;
}

/**
 * The interactive half of SMART standalone launch — the previously-missing consent/patient-picker
 * UI now lives in `apps/patient-portal`'s `/smart/authorize` page; this service is what it calls
 * once the patient decides. Deliberately reuses `ConsentService.assertAccess` (the exact same gate
 * every other portal action goes through) rather than inventing a parallel authorization check —
 * a portal account can only launch an app for a patient it could otherwise already see.
 *
 * No separate "remember this app" consent table exists — every launch re-prompts (see migration
 * 0049's doc comment). The issued row IS the consent record: tenant/audit-visible via normal DB
 * access, which is enough traceability without a second table.
 */
export class SmartLaunchService {
  constructor(private readonly consentService: ConsentService = new ConsentService()) {}

  async getClientInfo(trx: Executor, tenantId: string, clientId: string): Promise<SmartClientInfo> {
    const client = await trx
      .selectFrom('smart_clients')
      .select(['client_id', 'display_name'])
      .where('tenant_id', '=', tenantId)
      .where('client_id', '=', clientId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!client) throw new NotFoundError('SMART client not found', { clientId });
    return { clientId: client.client_id, displayName: client.display_name };
  }

  async decide(trx: Executor, ctx: PortalRequestContext, input: SmartAuthorizeDecisionInput): Promise<SmartAuthorizeDecisionResult> {
    const client = await trx
      .selectFrom('smart_clients')
      .selectAll()
      .where('tenant_id', '=', ctx.tenantId)
      .where('client_id', '=', input.clientId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!client) throw new NotFoundError('SMART client not found', { clientId: input.clientId });
    if (!client.redirect_uris.includes(input.redirectUri)) {
      throw new ValidationError('redirect_uri is not registered for this client', { redirectUri: input.redirectUri });
    }
    const requestedScopes = input.scope.split(' ').filter(Boolean);
    const disallowed = requestedScopes.filter((s) => !client.allowed_scopes.includes(s));
    if (disallowed.length > 0) {
      throw new ForbiddenError('Requested scope(s) are not permitted for this client', { disallowed });
    }

    const redirectUrl = new URL(input.redirectUri);
    if (input.decision === 'deny') {
      redirectUrl.searchParams.set('error', 'access_denied');
      if (input.state) redirectUrl.searchParams.set('state', input.state);
      return { redirectUrl: redirectUrl.toString() };
    }

    // Same gate every other portal action goes through — a portal account can only launch an app
    // for a patient it could otherwise already see, never an arbitrary id from the request.
    await this.consentService.assertAccess(trx, ctx.tenantId, ctx.actor.id, input.patientId);

    const code = await trx
      .insertInto('smart_authorization_codes')
      .values({
        tenant_id: ctx.tenantId,
        client_id: input.clientId,
        patient_id: input.patientId,
        portal_account_id: ctx.actor.id,
        scope: input.scope,
        redirect_uri: input.redirectUri,
        code_challenge: input.codeChallenge,
        code_challenge_method: input.codeChallengeMethod,
        expires_at: new Date(Date.now() + CODE_TTL_MS),
        status: 'issued',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    redirectUrl.searchParams.set('code', code.id);
    if (input.state) redirectUrl.searchParams.set('state', input.state);
    return { redirectUrl: redirectUrl.toString() };
  }
}
