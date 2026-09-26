/**
 * Carried through every request via AsyncLocalStorage (apps/api's TenantContextMiddleware) and
 * passed explicitly to domain services — never re-derived ad hoc inside a service, so authz,
 * audit, and outbox all agree on the same actor/tenant/correlation identity for a given call.
 */
export interface RequestContext {
  tenantId: string;
  requestId: string;
  correlationId: string;
  /**
   * Set by TenantContextMiddleware after JWT verification; absent for unauthenticated routes.
   * Deliberately carries no role/permission list — the JWT itself only carries `sub`/`tenant_id`
   * (see packages/auth-adapter), and packages/authz's role-permission layer queries
   * user_roles/role_permissions fresh on every request rather than trusting a cached/embedded
   * claim, so a revoked role takes effect immediately rather than only after token expiry.
   */
  actor?: {
    id: string;
    /**
     * `'patient'` is a portal account acting for itself or (via an active
     * `patient_proxy_grants` row — see `@ehr/consent`) for a linked patient. It intentionally
     * never satisfies `@ehr/authz`'s `rolePermissionLayer` (staff-only, spec §6.2) — portal routes
     * use `@SkipAuthz()` plus an explicit `ConsentService.assertAccess()` call instead. See
     * README's Phase 8 scope decisions for why this is a separate authorization path, not an
     * extension of the 8-layer PolicyEngine.
     */
    type: 'user' | 'system' | 'api_client' | 'patient';
  };
  ip?: string;
  userAgent?: string;
  /** e.g. "treatment" | "payment" | "operations" — spec §7.1 audit envelope's purpose field. */
  purpose?: string;
}
