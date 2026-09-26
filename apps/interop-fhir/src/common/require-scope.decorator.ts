import { SetMetadata } from '@nestjs/common';

export const SMART_SCOPE_KEY = 'smart_scope';

/** Marks a route as requiring a specific SMART scope (e.g. `patient/Observation.read`). */
export const RequireScope = (scope: string): MethodDecorator => SetMetadata(SMART_SCOPE_KEY, scope);
