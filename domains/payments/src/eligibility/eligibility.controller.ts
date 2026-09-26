import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CLEARINGHOUSE_GATEWAY } from '@ehr/claims';
import type { ClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { CreateEligibilityCheckSchema, type CreateEligibilityCheckInput } from './eligibility.dto.js';
import { EligibilityService } from './eligibility.service.js';

@Controller('api/v1/patients/:patientId/eligibility-checks')
export class EligibilityController {
  private readonly service: EligibilityService;

  constructor(@Inject(CLEARINGHOUSE_GATEWAY) gateway: ClearinghouseGateway) {
    this.service = new EligibilityService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.ELIGIBILITY_CHECK)
  @Audited('eligibility_check.create', 'EligibilityCheck')
  async check(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateEligibilityCheckSchema)) body: CreateEligibilityCheckInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.check(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('eligibility_check.list', 'EligibilityCheck')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
