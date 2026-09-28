import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateCoverageSchema, type CreateCoverageInput } from './coverage.dto.js';
import { CoverageService } from './coverage.service.js';

@Controller('api/v1/patients/:patientId/coverages')
export class CoverageController {
  constructor(private readonly service: CoverageService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.COVERAGE_MANAGE)
  @Audited('coverage.create', 'Coverage')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateCoverageSchema)) body: CreateCoverageInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.COVERAGE_MANAGE)
  @Audited('coverage.list', 'Coverage')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
