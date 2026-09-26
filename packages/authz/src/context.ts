/**
 * Input to PolicyEngine.authorize(). One AuthzContext per permission check — built by
 * apps/api's AuthzInterceptor from the request's verified JWT (RequestContext) plus route
 * metadata, never trusted from client-supplied fields other than the route param used to look up
 * `resource.id`.
 */
export interface AuthzContext {
  tenantId: string;
  actor: {
    id: string;
    type: 'user' | 'system' | 'api_client';
  };
  /** Permission key being checked, e.g. "location.manage" (see EHR_BUILD_SPEC.md §6.2). */
  action: string;
  resource?: {
    type: string;
    id?: string;
    /**
     * Only set when the caller already knows the target's tenant (e.g. a future cross-tenant
     * admin surface). Phase 1's ordinary CRUD endpoints leave this undefined and rely on
     * Row-Level Security + explicit `tenant_id` filtering in repositories to reject
     * cross-tenant access — the tenant-membership layer is NOT_APPLICABLE in that case, which is
     * expected, not a gap: RLS is the actual enforcement point for "does this row belong to me,"
     * this layer exists for cases where the application already has an opinion before the query.
     */
    tenantId?: string;
    sensitivity?: string;
    ownerId?: string;
  };
  purpose?: string;
  requestId: string;
}

export interface AuthzDecision {
  allowed: boolean;
  /** Name of the layer that produced a DENY, or (on a default-deny) the layer that had to grant. */
  deniedBy?: string;
}
