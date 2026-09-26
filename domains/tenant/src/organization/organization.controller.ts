import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateOrganizationSchema, type CreateOrganizationInput } from './organization.dto.js';
import { OrganizationService } from './organization.service.js';

@Controller('api/v1/organizations')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.ORGANIZATION_MANAGE)
  @Audited('organization.create', 'Organization')
  async create(@Body(new ZodValidationPipe(CreateOrganizationSchema)) body: CreateOrganizationInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.ORGANIZATION_MANAGE)
  @Audited('organization.read', 'Organization')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.ORGANIZATION_MANAGE)
  @Audited('organization.list', 'Organization')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
