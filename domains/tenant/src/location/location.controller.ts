import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateLocationSchema, type CreateLocationInput } from './location.dto.js';
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
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
