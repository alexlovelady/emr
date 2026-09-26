import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, throwError } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { PolicyEngine } from '../policy-engine.js';
import type { AuthzContext } from '../context.js';
import {
  REQUIRE_PERMISSION_METADATA_KEY,
  SKIP_AUTHZ_METADATA_KEY,
} from './require-permission.decorator.js';

interface RequestWithEhrContext {
  ehrContext?: RequestContext;
  params?: Record<string, string>;
}

/**
 * Global interceptor (register as APP_INTERCEPTOR in apps/api, AFTER the request-transaction
 * interceptor and BEFORE AuditInterceptor in registration order — see that package's docs for
 * why this must be an interceptor rather than a Guard: Nest runs Guards before any interceptor
 * gets to open the shared request transaction that getCurrentTransaction() reads from).
 *
 * Denial throws ForbiddenError (-> 403). Cross-tenant access to a real resource under a
 * *different* tenant is NOT this interceptor's job to reject — Row-Level Security plus each
 * repository's own `tenant_id` filter means such a lookup simply finds nothing, producing a
 * NotFoundError (-> 404) from the domain layer itself, which is the safer response for the
 * "guessed UUID" tenant-isolation test (spec §18.2): it must not even reveal that the ID exists
 * under another tenant by returning a 403 instead of a 404.
 */
@Injectable()
export class AuthzInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyEngine: PolicyEngine,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.get<boolean>(SKIP_AUTHZ_METADATA_KEY, context.getHandler());
    if (skip) {
      return next.handle();
    }

    const permission = this.reflector.get<string>(REQUIRE_PERMISSION_METADATA_KEY, context.getHandler());
    if (!permission) {
      return throwError(
        () =>
          new Error(
            `${context.getClass().name}.${String(context.getHandler().name)} has neither ` +
              '@RequirePermission nor @SkipAuthz — refusing to serve an unclassified route. ' +
              'This should have been caught by the controller-authz architecture test.',
          ),
      );
    }

    const req = context.switchToHttp().getRequest<RequestWithEhrContext>();
    const ehrCtx = req.ehrContext;
    if (!ehrCtx?.actor) {
      return throwError(() => new ForbiddenError('No authenticated actor on request'));
    }

    const authzCtx: AuthzContext = {
      tenantId: ehrCtx.tenantId,
      actor: { id: ehrCtx.actor.id, type: ehrCtx.actor.type },
      action: permission,
      requestId: ehrCtx.requestId,
      ...(req.params?.id ? { resource: { type: 'unknown', id: req.params.id } } : {}),
      ...(ehrCtx.purpose !== undefined ? { purpose: ehrCtx.purpose } : {}),
    };

    return from(this.policyEngine.authorize(authzCtx, getCurrentTransaction())).pipe(
      concatMap((decision) => {
        if (!decision.allowed) {
          return throwError(
            () => new ForbiddenError(`Permission denied: ${permission}`, { deniedBy: decision.deniedBy }),
          );
        }
        return next.handle();
      }),
    );
  }
}
