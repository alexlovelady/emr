import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { AssignRoleSchema, type AssignRoleInput } from './role.dto.js';
import { RoleService } from './role.service.js';

@Controller('api/v1')
export class RoleController {
  constructor(private readonly service: RoleService) {}

  @Get('roles')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('role.list', 'Role')
  async list() {
    return this.service.list(getCurrentTransaction());
  }

  @Post('users/:id/roles')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('user.role.assign', 'User')
  async assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignRoleSchema)) body: AssignRoleInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.assignToUser(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
