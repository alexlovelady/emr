import { Controller, Get, Param, Post, Query, Req, Body } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateResourceSchema,
  ListResourcesQuerySchema,
  type CreateResourceInput,
  type ListResourcesQuery,
} from './resource.dto.js';
import { ResourceService } from './resource.service.js';

/** Rooms/equipment for multi-resource scheduling — same permission as appointments, since a
 * resource has no independent business meaning outside scheduling. */
@Controller('api/v1/resources')
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('resource.create', 'Resource')
  async create(@Body(new ZodValidationPipe(CreateResourceSchema)) body: CreateResourceInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('resource.read', 'Resource')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('resource.list', 'Resource')
  async list(@Query(new ZodValidationPipe(ListResourcesQuerySchema)) query: ListResourcesQuery, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), {
      ...(query.locationId ? { locationId: query.locationId } : {}),
    });
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
