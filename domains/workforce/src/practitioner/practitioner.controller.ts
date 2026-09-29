import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { PaginationQuerySchema, ZodValidationPipe, type PaginationQuery } from '@ehr/api-contracts';
import {
  CreatePractitionerSchema,
  UpdatePractitionerSchema,
  type CreatePractitionerInput,
  type UpdatePractitionerInput,
} from './practitioner.dto.js';
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
  async list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), query);
  }

  @Patch(':id')
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner.update', 'Practitioner')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePractitionerSchema)) body: UpdatePractitionerInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.update(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post(':id/deactivate')
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner.deactivate', 'Practitioner')
  async deactivate(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.deactivate(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
