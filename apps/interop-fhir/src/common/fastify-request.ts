import type {} from 'fastify';

export interface FhirRequestContext {
  tenantId: string;
  clientId: string;
  scope: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    fhirContext?: FhirRequestContext;
  }
}
