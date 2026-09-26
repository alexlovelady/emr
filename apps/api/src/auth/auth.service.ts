import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { withTenantContext, type DB } from '@ehr/db';
import { recordAuditEvent } from '@ehr/audit';
import type { IdentityProvider, TokenPair } from '@ehr/auth-adapter';
import { DB_CONNECTION, IDENTITY_PROVIDER } from '../common/tokens.js';

export interface RequestMeta {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Login/refresh/logout happen before any request-scoped transaction exists (there is no
 * authenticated tenant yet), so this service cannot rely on the generic AuditInterceptor /
 * getCurrentTransaction() the way authenticated routes do — see apps/api's auth.controller.ts
 * marking these routes @SkipAudit. Instead it records the spec §7.1-required "authentication
 * events" audit entry explicitly, once the tenant is known.
 *
 * Known Phase 1 gap (tracked, not silently dropped): a failed login against a genuinely unknown
 * tenant slug has no tenant to scope an audit_events row to, so it is not currently audited.
 * Failed attempts against a KNOWN tenant with a wrong password/email are also not yet audited —
 * only successful logins are. Close this before any real pilot; spec §7.1 lists authentication
 * events (successful AND failed) as required audit capture.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
  ) {}

  async login(tenantSlug: string, email: string, password: string, meta: RequestMeta): Promise<TokenPair> {
    const { userId, tenantId } = await this.identityProvider.verifyCredentials(tenantSlug, email, password);
    const tokens = await this.identityProvider.issueTokens(userId, tenantId);
    await this.auditAuthEvent(tenantId, userId, 'auth.login', 'success', meta);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.identityProvider.refresh(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.identityProvider.revoke(refreshToken);
  }

  private async auditAuthEvent(
    tenantId: string,
    userId: string,
    action: string,
    outcome: 'success' | 'failure',
    meta: RequestMeta,
  ): Promise<void> {
    await withTenantContext(this.db, tenantId, (trx) =>
      recordAuditEvent(trx, {
        tenantId,
        actor: { type: 'user', id: userId },
        action,
        resource: { type: 'Session', id: null },
        requestId: meta.requestId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        outcome,
      }),
    );
  }
}
