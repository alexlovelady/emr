/**
 * Carried through every request via AsyncLocalStorage (apps/api's TenantContextMiddleware) and
 * passed explicitly to domain services — never re-derived ad hoc inside a service, so authz,
 * audit, and outbox all agree on the same actor/tenant/correlation identity for a given call.
 */
export interface RequestContext {
  tenantId: string;
  requestId: string;
  correlationId: string;
  /** Set by TenantContextMiddleware after JWT verification; absent for unauthenticated routes. */
  actor?: {
    id: string;
    type: 'user' | 'system' | 'api_client';
    roles: string[];
  };
  ip?: string;
  userAgent?: string;
  /** e.g. "treatment" | "payment" | "operations" — spec §7.1 audit envelope's purpose field. */
  purpose?: string;
}
