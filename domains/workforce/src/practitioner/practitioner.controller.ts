import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ListByIdsSchema, PaginationQuerySchema, ZodValidationPipe, type ListByIdsInput, type PaginationQuery } from '@ehr/api-contracts';
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

  /** Display names only — a lower bar (PATIENT_READ_CLINICAL, already held by any clinical staff
   * account) than the admin-tier PRACTITIONER_MANAGE the full list/getById require, so a plain
   * clinician can resolve a practitionerId shown elsewhere (e.g. the schedule table) to a name. */
  @Post('names')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('practitioner.names.list', 'Practitioner')
  async listNames(@Body(new ZodValidationPipe(ListByIdsSchema)) body: ListByIdsInput, @Req() req: FastifyRequest) {
    return this.service.listNames(getCurrentTransaction(), requireCtx(req), body.ids);
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
