import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { NotFoundError, type RequestContext } from '@ehr/domain-common';

type Executor = Kysely<DB> | Transaction<DB>;

export interface PortalSessionRow {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * "API/app authorization management" scoped to real session/device management (EHR_BUILD_SPEC.md
 * §17) — a full third-party OAuth-app consent flow is a separate feature the spec's own bullet
 * doesn't detail further. Reads `portal_refresh_tokens` directly (no separate repository class),
 * the same inline-query style `AuthService`/`FirstPartyIdentityProvider` already use for the
 * equivalent staff `refresh_tokens` table.
 */
export class PortalSessionService {
  async list(trx: Executor, ctx: RequestContext): Promise<PortalSessionRow[]> {
    const portalAccountId = requirePortalActorId(ctx);
    const rows = await trx
      .selectFrom('portal_refresh_tokens')
      .select(['id', 'expires_at', 'revoked_at', 'created_at'])
      .where('tenant_id', '=', ctx.tenantId)
      .where('portal_account_id', '=', portalAccountId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => ({ id: row.id, expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at }));
  }

  async revoke(trx: Executor, ctx: RequestContext, sessionId: string): Promise<void> {
    const portalAccountId = requirePortalActorId(ctx);
    const row = await trx
      .selectFrom('portal_refresh_tokens')
      .select('id')
      .where('tenant_id', '=', ctx.tenantId)
      .where('portal_account_id', '=', portalAccountId)
      .where('id', '=', sessionId)
      .executeTakeFirst();
    if (!row) throw new NotFoundError('Session not found', { sessionId });

    await trx
      .updateTable('portal_refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('tenant_id', '=', ctx.tenantId)
      .where('id', '=', sessionId)
      .execute();
  }
}

function requirePortalActorId(ctx: RequestContext): string {
  if (ctx.actor?.type !== 'patient') {
    throw new NotFoundError('Session not found');
  }
  return ctx.actor.id;
}
