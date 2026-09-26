import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, firstValueFrom } from 'rxjs';
import type { Kysely } from 'kysely';
import { runWithRequestTransaction, type DB } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { DB_CONNECTION } from './tokens.js';

/** Identical in purpose to apps/api's interceptor of the same name — see its doc comment. */
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
