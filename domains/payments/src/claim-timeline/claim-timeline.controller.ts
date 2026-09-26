import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { CLEARINGHOUSE_GATEWAY, ClaimService } from '@ehr/claims';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { RemittanceService } from '../remittance/remittance.service.js';
import { ClaimTimelineService } from './claim-timeline.service.js';

@Controller('api/v1/claims/:id/timeline')
export class ClaimTimelineController {
  private readonly service: ClaimTimelineService;

  constructor(@Inject(CLEARINGHOUSE_GATEWAY) gateway: ClearinghouseGateway) {
    const claimService = new ClaimService(gateway);
    this.service = new ClaimTimelineService(claimService, new RemittanceService(claimService));
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('claim.timeline', 'Claim')
  async getTimeline(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getTimeline(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
