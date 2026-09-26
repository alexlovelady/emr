import { createHash } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, Observable, firstValueFrom } from 'rxjs';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { IdempotencyConflictError, type RequestContext } from '@ehr/domain-common';

/**
 * Spec rule #11: "All write APIs must be idempotent where retries are realistic." Opt-in via an
 * `Idempotency-Key` header on POST requests (a request with no header is not made idempotent —
 * that's a client choice, matching common REST convention). Must run INSIDE
 * RequestTransactionInterceptor (registered after it) so getCurrentTransaction() is available —
 * the stored key and the domain write it guards land in the same transaction.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<FastifyRequest & { ehrContext?: RequestContext }>();
    const key = req.headers['idempotency-key'] as string | undefined;
    const tenantId = req.ehrContext?.tenantId;
    if (req.method !== 'POST' || !key || !tenantId) {
      return next.handle();
    }

    const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    return from(this.handleIdempotent(tenantId, key, requestHash, next));
  }

  private async handleIdempotent(
    tenantId: string,
    key: string,
    requestHash: string,
    next: CallHandler,
  ): Promise<unknown> {
    const trx = getCurrentTransaction();
    const existing = await trx
      .selectFrom('idempotency_keys')
      .select(['request_hash', 'response_body'])
      .where('tenant_id', '=', tenantId)
      .where('key', '=', key)
      .executeTakeFirst();

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new IdempotencyConflictError('Idempotency-Key was reused with a different request body');
      }
      return existing.response_body;
    }

    const result = await firstValueFrom(next.handle());
    await trx
      .insertInto('idempotency_keys')
      .values({
        tenant_id: tenantId,
        key,
        request_hash: requestHash,
        response_status: 200,
        response_body: JSON.stringify(result ?? {}),
      })
      .execute();
    return result;
  }
}
