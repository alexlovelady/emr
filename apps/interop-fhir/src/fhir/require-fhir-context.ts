import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@ehr/domain-common';
import type { FhirRequestContext } from '../common/fastify-request.js';
import '../common/fastify-request.js';

export function requireFhirCtx(req: FastifyRequest): FhirRequestContext {
  if (!req.fhirContext) throw new ForbiddenError('Missing or invalid SMART bearer token');
  return req.fhirContext;
}
