import { Controller, Get, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { LedgerService } from './ledger.service.js';

@Controller('api/v1/patients/:patientId/ledger')
export class LedgerController {
  constructor(private readonly service: LedgerService) {}

  @Get()
  @RequirePermission(PERMISSION_KEYS.LEDGER_READ)
  @Audited('ledger.read', 'PatientLedger')
  async getLedger(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.getLedger(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
