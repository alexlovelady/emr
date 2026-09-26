import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateIntakeFormResponseSchema,
  SubmitIntakeFormResponseSchema,
  type CreateIntakeFormResponseInput,
  type SubmitIntakeFormResponseInput,
} from './response.dto.js';
import { IntakeFormResponseService } from './response.service.js';

@Controller('api/v1/intake-form-responses')
export class IntakeFormResponseController {
  constructor(private readonly service: IntakeFormResponseService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.INTAKE_RESPONSE_MANAGE)
  @Audited('intake_form_response.create', 'IntakeFormResponse')
  async create(
    @Body(new ZodValidationPipe(CreateIntakeFormResponseSchema)) body: CreateIntakeFormResponseInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.INTAKE_RESPONSE_MANAGE)
  @Audited('intake_form_response.read', 'IntakeFormResponse')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.INTAKE_RESPONSE_MANAGE)
  @Audited('intake_form_response.list', 'IntakeFormResponse')
  async list(@Query('patientId') patientId: string | undefined, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId ? { patientId } : {});
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSION_KEYS.INTAKE_RESPONSE_MANAGE)
  @Audited('intake_form_response.submit', 'IntakeFormResponse')
  async submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitIntakeFormResponseSchema)) body: SubmitIntakeFormResponseInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.submit(getCurrentTransaction(), requireCtx(req), id, body.answers);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
