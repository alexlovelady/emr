import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreatePractitionerSchema, type CreatePractitionerInput } from './practitioner.dto.js';
import { PractitionerService } from './practitioner.service.js';

@Controller('api/v1/practitioners')
export class PractitionerController {
  constructor(private readonly service: PractitionerService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner.create', 'Practitioner')
  async create(
    @Body(new ZodValidationPipe(CreatePractitionerSchema)) body: CreatePractitionerInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner.read', 'Practitioner')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner.list', 'Practitioner')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
