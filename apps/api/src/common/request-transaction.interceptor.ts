import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, firstValueFrom } from 'rxjs';
import type { Kysely } from 'kysely';
import { runWithRequestTransaction, type DB } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { DB_CONNECTION } from './tokens.js';

/**
 * MUST be the first (outermost) global interceptor — register it before AuthzInterceptor and
 * AuditInterceptor in app.module.ts's APP_INTERCEPTOR provider array (Nest composes global
 * interceptors as nested wrappers in registration order). Opens exactly one tenant-scoped
 * transaction for the whole request (packages/db's runWithRequestTransaction) so every domain
 * write, the authz check, and the audit write all see/participate in the same transaction.
 *
 * Only opens a transaction when `req.ehrContext` is already set (i.e. the request is
 * authenticated) — public routes (@SkipAuthz: login, refresh, JWKS, health) have no tenant to
 * scope a transaction to and manage their own database access directly (see the auth module).
 */
@Injectable()
export class RequestTransactionInterceptor implements NestInterceptor {
  constructor(@Inject(DB_CONNECTION) private readonly db: Kysely<DB>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ ehrContext?: RequestContext }>();
    const tenantId = req.ehrContext?.tenantId;
    if (!tenantId) {
      return next.handle();
    }

    return from(runWithRequestTransaction(this.db, tenantId, () => firstValueFrom(next.handle())));
  }
}
