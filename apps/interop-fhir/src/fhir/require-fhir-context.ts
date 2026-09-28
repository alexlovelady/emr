import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@ehr/domain-common';
import type { FhirRequestContext } from '../common/fastify-request.js';
import '../common/fastify-request.js';

export function requireFhirCtx(req: FastifyRequest): FhirRequestContext {
  if (!req.fhirContext) throw new ForbiddenError('Missing or invalid SMART bearer token');
  return req.fhirContext;
}

/**
 * A token issued via the authorization_code grant carries a `patient` launch-context claim — the
 * whole point of standalone launch is that the app only ever sees that one patient's data, not
 * every patient the scope string would otherwise reach (that broader access is what a
 * `client_credentials` token, with no `patientId`, is for). A `client_credentials` token has no
 * `patientId` at all and is unrestricted by this check.
 */
export function assertPatientInLaunchContext(ctx: FhirRequestContext, requestedPatientId: string): void {
  if (ctx.patientId && ctx.patientId !== requestedPatientId) {
    throw new ForbiddenError('This token is scoped to a different patient', { requestedPatientId });
  }
}
