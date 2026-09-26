import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@ehr/domain-common';
import '@ehr/api-contracts';

/** RFC7807 problem+json, per EHR_BUILD_SPEC.md §8.2 — identical to apps/api's filter of the same name. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { status, type, title, detail } = classify(exception);
    if (status >= 500) {
      console.error('[ProblemDetailsFilter] unhandled exception:', exception);
    }

    void response.status(status).send({
      type,
      title,
      status,
      ...(detail !== undefined ? { detail } : {}),
      instance: request.url,
    });
  }
}

function classify(exception: unknown): { status: number; type: string; title: string; detail?: unknown } {
  if (exception instanceof DomainError) {
    return { status: exception.httpStatus, type: exception.problemType, title: exception.message, detail: exception.details };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { status, type: `https://docs.ehr.internal/problems/http-${status}`, title: exception.message };
  }
  const title = exception instanceof Error ? exception.message : 'Internal Server Error';
  return { status: 500, type: 'about:blank', title };
}
