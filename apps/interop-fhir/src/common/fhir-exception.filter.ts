import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DomainError } from '@ehr/domain-common';

/** EHR_BUILD_SPEC.md §8.1: "standardized OperationOutcome errors" — the FHIR-native error shape, not RFC7807. */
@Catch()
export class FhirExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const { status, code, diagnostics } = classify(exception);
    if (status >= 500) {
      console.error('[FhirExceptionFilter] unhandled exception:', exception);
    }
    void response.status(status).send({
      resourceType: 'OperationOutcome',
      issue: [{ severity: status >= 500 ? 'fatal' : 'error', code, diagnostics }],
    });
  }
}

function classify(exception: unknown): { status: number; code: string; diagnostics: string } {
  if (exception instanceof DomainError) {
    return { status: exception.httpStatus, code: fhirIssueCode(exception.httpStatus), diagnostics: exception.message };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { status, code: fhirIssueCode(status), diagnostics: exception.message };
  }
  const diagnostics = exception instanceof Error ? exception.message : 'Internal Server Error';
  return { status: 500, code: 'exception', diagnostics };
}

function fhirIssueCode(status: number): string {
  if (status === 404) return 'not-found';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'login';
  if (status === 422) return 'invalid';
  if (status === 409) return 'conflict';
  return 'exception';
}
