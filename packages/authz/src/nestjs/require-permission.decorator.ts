import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_METADATA_KEY = 'ehr:require-permission';
export const SKIP_AUTHZ_METADATA_KEY = 'ehr:skip-authz';

/**
 * Marks a controller method as requiring this permission key (spec §6.2's representative
 * strings, e.g. "location.manage"). Enforced by the global AuthzInterceptor BEFORE the handler
 * runs (spec rule #3: authorization is never optional/bypassable). A repo-level architecture
 * test fails CI if any controller method has neither this nor @SkipAuthz.
 */
export const RequirePermission = (permission: string): ClassDecorator & MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_METADATA_KEY, permission);

/**
 * Explicit escape hatch for routes with no permission check (health checks, login, JWKS).
 * Usable at the class level (exempts every route in the controller) or per method.
 */
export const SkipAuthz = (): ClassDecorator & MethodDecorator => SetMetadata(SKIP_AUTHZ_METADATA_KEY, true);
