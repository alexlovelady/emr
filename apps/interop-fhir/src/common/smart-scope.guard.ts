import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@ehr/domain-common';
import { SMART_SCOPE_KEY } from './require-scope.decorator.js';
import './fastify-request.js';

/**
 * The FHIR-side authorization mechanism: SMART scopes, not `@ehr/authz`'s 8-layer PolicyEngine.
 * External SMART apps authenticate as a `smart_clients` row, not an internal staff user with
 * `user_roles` — there is no permission catalog to check here, only "does the token's `scope`
 * claim contain what this route requires."
 */
@Injectable()
export class SmartScopeGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(SMART_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScope) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.fhirContext) {
      throw new ForbiddenError('Missing or invalid SMART bearer token');
    }
    if (!req.fhirContext.scope.includes(requiredScope)) {
      throw new ForbiddenError(`Missing required SMART scope: ${requiredScope}`, { requiredScope });
    }
    return true;
  }
}
