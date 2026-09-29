import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { ResolveDenialSchema, type ResolveDenialInput } from './denial.dto.js';
import { DenialService } from './denial.service.js';

@Controller('api/v1/patients/:patientId/denials')
export class PatientDenialController {
  constructor(private readonly service: DenialService) {}

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('denial.list', 'Denial')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/denials')
export class DenialController {
  constructor(private readonly service: DenialService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('denial.read', 'Denial')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/resolve')
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('denial.resolve', 'Denial')
  async resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveDenialSchema)) body: ResolveDenialInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.resolve(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
