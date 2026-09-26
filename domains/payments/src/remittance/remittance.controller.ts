import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { CLEARINGHOUSE_GATEWAY, ClaimService } from '@ehr/claims';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { RemittanceService } from './remittance.service.js';

@Controller('api/v1/claims/:claimId/remittances')
export class RemittanceController {
  private readonly service: RemittanceService;

  constructor(@Inject(CLEARINGHOUSE_GATEWAY) gateway: ClearinghouseGateway) {
    this.service = new RemittanceService(new ClaimService(gateway));
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.LEDGER_READ)
  @Audited('remittance.list', 'Remittance')
  async list(@Param('claimId') claimId: string, @Req() req: FastifyRequest) {
    return this.service.listByClaim(getCurrentTransaction(), requireCtx(req), claimId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
