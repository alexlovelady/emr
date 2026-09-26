import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateProblemSchema, UpdateProblemStatusSchema, type CreateProblemInput, type UpdateProblemStatusInput } from './problem.dto.js';
import { ProblemService } from './problem.service.js';

@Controller('api/v1/patients/:patientId/problems')
export class ProblemController {
  constructor(private readonly service: ProblemService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PROBLEM_MANAGE)
  @Audited('problem.create', 'Problem')
  async create(@Param('patientId') patientId: string, @Body(new ZodValidationPipe(CreateProblemSchema)) body: CreateProblemInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('problem.list', 'Problem')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/problems')
export class ProblemDetailController {
  constructor(private readonly service: ProblemService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('problem.read', 'Problem')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Put(':id/status')
  @RequirePermission(PERMISSION_KEYS.PROBLEM_MANAGE)
  @Audited('problem.update_status', 'Problem')
  async updateStatus(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateProblemStatusSchema)) body: UpdateProblemStatusInput, @Req() req: FastifyRequest) {
    return this.service.updateStatus(getCurrentTransaction(), requireCtx(req), id, body.clinicalStatus);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
