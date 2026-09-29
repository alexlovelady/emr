import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { PaginationQuerySchema, ZodValidationPipe, type PaginationQuery } from '@ehr/api-contracts';
import { CreateLocationSchema, UpdateLocationSchema, type CreateLocationInput, type UpdateLocationInput } from './location.dto.js';
import { LocationService } from './location.service.js';

@Controller('api/v1/locations')
export class LocationController {
  constructor(private readonly service: LocationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.LOCATION_MANAGE)
  @Audited('location.create', 'Location')
  async create(@Body(new ZodValidationPipe(CreateLocationSchema)) body: CreateLocationInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.LOCATION_MANAGE)
  @Audited('location.read', 'Location')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.LOCATION_MANAGE)
  @Audited('location.list', 'Location')
  async list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), query);
  }

  @Patch(':id')
  @RequirePermission(PERMISSION_KEYS.LOCATION_MANAGE)
  @Audited('location.update', 'Location')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLocationSchema)) body: UpdateLocationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.update(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post(':id/deactivate')
  @RequirePermission(PERMISSION_KEYS.LOCATION_MANAGE)
  @Audited('location.deactivate', 'Location')
  async deactivate(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.deactivate(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
