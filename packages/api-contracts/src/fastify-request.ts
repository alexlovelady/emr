import type {} from 'fastify';
import type { RequestContext } from '@ehr/domain-common';

/**
 * Ambient augmentation, centralized here (not in each consumer) so every package that touches
 * `FastifyRequest` — apps/api's middleware/interceptors and every domain's controllers — sees
 * the same `ehrContext` shape. Side-effect-imported by this package's index.ts; consumers get it
 * automatically just by importing anything from @ehr/api-contracts.
 */
declare module 'fastify' {
  interface FastifyRequest {
    ehrContext?: RequestContext;
  }
}
