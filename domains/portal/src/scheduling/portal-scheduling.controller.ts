import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { PortalSchedulingService } from './portal-scheduling.service.js';

/** Tenant-wide (not per-patient) lookups — who/where a patient can book with. See
 * PortalSchedulingService's doc comment for why no ConsentService check applies here. */
@Controller('api/v1/portal')
@SkipAuthz()
export class PortalSchedulingController {
  private readonly service = new PortalSchedulingService();

  @Get('practitioners')
  @Audited('portal_scheduling.list_practitioners', 'Practitioner')
  async listPractitioners(@Req() req: FastifyRequest) {
    return this.service.listBookablePractitioners(getCurrentTransaction(), requirePortalCtx(req));
  }

  @Get('locations')
  @Audited('portal_scheduling.list_locations', 'Location')
  async listLocations(@Req() req: FastifyRequest) {
    return this.service.listBookableLocations(getCurrentTransaction(), requirePortalCtx(req));
  }
}

function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
