import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'ehr:audit';
export const SKIP_AUDIT_METADATA_KEY = 'ehr:skip-audit';

export interface AuditMetadata {
  action: string;
  resourceType: string;
}

/**
 * Marks a controller method as producing exactly one audit event per call, via the global
 * AuditInterceptor. `action` should match the permission-string style used by @RequirePermission
 * (e.g. "location.create"); `resourceType` is the audited resource's type (e.g. "Location").
 *
 * A repo-level architecture test (packages/testing) fails CI if any controller method has
 * neither this nor @SkipAudit — "audit events exist for all foundation APIs" (spec §26 Phase 1
 * exit gate) is meant to be mechanically true, not a promise developers can forget.
 */
export const Audited = (action: string, resourceType: string): ClassDecorator & MethodDecorator =>
  SetMetadata(AUDIT_METADATA_KEY, { action, resourceType } satisfies AuditMetadata);

/**
 * Explicit escape hatch for routes with no domain resource to audit (e.g. health checks).
 * Usable at the class level (exempts every route in the controller) or per method.
 */
export const SkipAudit = (): ClassDecorator & MethodDecorator => SetMetadata(SKIP_AUDIT_METADATA_KEY, true);
