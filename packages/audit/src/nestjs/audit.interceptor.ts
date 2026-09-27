import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { recordAuditEvent } from '../audit-service.js';
import { AUDIT_METADATA_KEY, SKIP_AUDIT_METADATA_KEY, type AuditMetadata } from './audited.decorator.js';

interface RequestWithEhrContext {
  ehrContext?: RequestContext;
  params?: Record<string, string>;
}

/**
 * Global interceptor (register as APP_INTERCEPTOR in apps/api). Must run AFTER apps/api's
 * request-transaction interceptor in the chain (i.e. registered later, so it wraps *inside* it —
 * Nest composes global interceptors in registration order as nested wrappers) so that
 * getCurrentTransaction() resolves to the same transaction the handler's domain write used.
 *
 * Uses concatMap (not tap) for the actual audit insert so it is genuinely awaited as part of the
 * response pipeline — a fire-and-forget `tap(async () => ...)` would let the transaction commit
 * (and the response send) before the audit row is guaranteed written.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<AuditMetadata>(AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<RequestWithEhrContext>();

    if (!meta) {
      console.error(
        `[AuditInterceptor] ${context.getClass().name}.${String(context.getHandler().name)} has ` +
          'neither @Audited nor @SkipAudit — no audit event will be recorded for this call. ' +
          'This should have been caught by the controller-audit architecture test.',
      );
      return next.handle();
    }

    const ctx = req.ehrContext;
    // tenant_id/request_id are `uuid` columns in audit_events — a fallback must be a real UUID,
    // never a sentinel string. This path should be unreachable in practice: any @Audited route
    // is necessarily also @RequirePermission-checked (or explicitly @SkipAuthz, which pairs with
    // @SkipAudit on every current route), and TenantContextMiddleware always populates
    // ehrContext. Kept as a last-resort guard, not a designed code path.
    const base = {
      tenantId: ctx?.tenantId || randomUUID(),
      actor: {
        type: ctx?.actor?.type ?? 'system',
        id: ctx?.actor?.id ?? null,
      },
      action: meta.action,
      requestId: ctx?.requestId ?? randomUUID(),
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      purpose: ctx?.purpose ?? null,
    };

    return next.handle().pipe(
      concatMap((result: unknown) =>
        from(
          recordAuditEvent(getCurrentTransaction(), {
            ...base,
            resource: { type: meta.resourceType, id: extractResourceId(result, req.params) },
            outcome: 'success',
          }).then(() => result),
        ),
      ),
      catchError((err: unknown) => {
        const outcome = err instanceof ForbiddenError ? 'denied' : 'failure';
        let trx;
        try {
          trx = getCurrentTransaction();
        } catch {
          // No transaction was ever opened for this request — RequestTransactionInterceptor only
          // opens one once ehrContext.tenantId is known, so a @SkipAuthz self-lookup route
          // (e.g. /auth/me, /auth/permissions) called with no/invalid token fails here with
          // nothing to audit against. Don't let that secondary failure mask the real error.
          return throwError(() => err);
        }
        return from(
          recordAuditEvent(trx, {
            ...base,
            resource: { type: meta.resourceType, id: extractResourceId(undefined, req.params) },
            outcome,
            metadata: { error: err instanceof Error ? err.message : String(err) },
          }).catch((auditErr: unknown) => {
            console.error('[AuditInterceptor] failed to record failure/denial audit event:', auditErr);
          }),
        ).pipe(concatMap(() => throwError(() => err)));
      }),
    );
  }
}

function extractResourceId(result: unknown, params: Record<string, string> | undefined): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return params?.id ?? null;
}
