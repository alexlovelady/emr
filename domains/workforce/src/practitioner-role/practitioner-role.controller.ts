import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreatePractitionerRoleSchema, type CreatePractitionerRoleInput } from './practitioner-role.dto.js';
import { PractitionerRoleService } from './practitioner-role.service.js';

@Controller('api/v1/practitioners/:practitionerId/location-roles')
export class PractitionerRoleController {
  constructor(private readonly service: PractitionerRoleService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner_role.create', 'PractitionerRole')
  async create(
    @Param('practitionerId') practitionerId: string,
    @Body(new ZodValidationPipe(CreatePractitionerRoleSchema)) body: CreatePractitionerRoleInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), practitionerId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner_role.list', 'PractitionerRole')
  async list(@Param('practitionerId') practitionerId: string, @Req() req: FastifyRequest) {
    return this.service.listByPractitioner(getCurrentTransaction(), requireCtx(req), practitionerId);
  }

  @Post(':id/revoke')
  @RequirePermission(PERMISSION_KEYS.PRACTITIONER_MANAGE)
  @Audited('practitioner_role.revoke', 'PractitionerRole')
  async revoke(@Param('practitionerId') practitionerId: string, @Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.revoke(getCurrentTransaction(), requireCtx(req), practitionerId, id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
