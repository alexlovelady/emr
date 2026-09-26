import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateIntakeFormTemplateSchema, type CreateIntakeFormTemplateInput } from './template.dto.js';
import { IntakeFormTemplateService } from './template.service.js';

@Controller('api/v1/intake-form-templates')
export class IntakeFormTemplateController {
  constructor(private readonly service: IntakeFormTemplateService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.INTAKE_FORM_MANAGE)
  @Audited('intake_form_template.create', 'IntakeFormTemplate')
  async create(
    @Body(new ZodValidationPipe(CreateIntakeFormTemplateSchema)) body: CreateIntakeFormTemplateInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.INTAKE_FORM_MANAGE)
  @Audited('intake_form_template.read', 'IntakeFormTemplate')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.INTAKE_FORM_MANAGE)
  @Audited('intake_form_template.list', 'IntakeFormTemplate')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
