import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { SmartAuthorizeDecisionSchema, type SmartAuthorizeDecisionInput } from './smart-launch.dto.js';
import { SmartLaunchService } from './smart-launch.service.js';

/** Backs `apps/patient-portal`'s `/smart/authorize` consent screen — see `SmartLaunchService`'s
 * own doc comment for how this fits into the standalone-launch flow. */
@Controller('api/v1/portal/smart')
@SkipAuthz()
export class PortalSmartLaunchController {
  private readonly service = new SmartLaunchService();

  @Get('client-info')
  @Audited('portal_smart_launch.client_info', 'SmartClient')
  async clientInfo(@Query('clientId') clientId: string, @Req() req: FastifyRequest) {
    const ctx = requirePortalCtx(req);
    return this.service.getClientInfo(getCurrentTransaction(), ctx.tenantId, clientId);
  }

  @Post('authorize-decision')
  @Audited('portal_smart_launch.authorize_decision', 'SmartAuthorizationCode')
  async decide(
    @Body(new ZodValidationPipe(SmartAuthorizeDecisionSchema)) body: SmartAuthorizeDecisionInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requirePortalCtx(req);
    return this.service.decide(getCurrentTransaction(), ctx, body);
  }
}

type PortalRequestContext = RequestContext & { actor: { id: string; type: 'patient' } };

function requirePortalCtx(req: FastifyRequest): PortalRequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext as PortalRequestContext;
}
