import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { PortalSessionService } from './portal-session.service.js';

@Controller('api/v1/portal/sessions')
@SkipAuthz()
export class PortalSessionController {
  constructor(private readonly service: PortalSessionService) {}

  @Get()
  @Audited('portal_session.list', 'PortalSession')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requirePortalCtx(req));
  }

  @Post(':id/revoke')
  @Audited('portal_session.revoke', 'PortalSession')
  async revoke(@Param('id') id: string, @Req() req: FastifyRequest): Promise<void> {
    await this.service.revoke(getCurrentTransaction(), requirePortalCtx(req), id);
  }
}

function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
