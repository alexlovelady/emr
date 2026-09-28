import type {} from 'fastify';

export interface FhirRequestContext {
  tenantId: string;
  clientId: string;
  scope: string[];
  /** SMART launch context — set only for a token issued via the authorization_code grant. */
  patientId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    fhirContext?: FhirRequestContext;
  }
}
