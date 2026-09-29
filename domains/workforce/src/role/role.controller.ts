import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  AssignRoleSchema,
  CreateRoleSchema,
  GrantPermissionSchema,
  ListUserRoleGrantsSchema,
  type AssignRoleInput,
  type CreateRoleInput,
  type GrantPermissionInput,
  type ListUserRoleGrantsInput,
} from './role.dto.js';
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

  @Post('roles')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('role.create', 'Role')
  async createRole(@Body(new ZodValidationPipe(CreateRoleSchema)) body: CreateRoleInput) {
    return this.service.createRole(getCurrentTransaction(), body);
  }

  @Get('roles/:id/permissions')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('role.permissions.list', 'Role')
  async listPermissions(@Param('id') id: string) {
    return this.service.listPermissions(getCurrentTransaction(), id);
  }

  @Post('roles/:id/permissions')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('role.permissions.grant', 'Role')
  async grantPermission(@Param('id') id: string, @Body(new ZodValidationPipe(GrantPermissionSchema)) body: GrantPermissionInput) {
    return this.service.grantPermission(getCurrentTransaction(), id, body);
  }

  @Post('roles/:id/permissions/revoke')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('role.permissions.revoke', 'Role')
  async revokePermission(@Param('id') id: string, @Body(new ZodValidationPipe(GrantPermissionSchema)) body: GrantPermissionInput) {
    return this.service.revokePermission(getCurrentTransaction(), id, body.permissionKey);
  }

  @Post('users/roles/bulk')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('user.roles.list_bulk', 'User')
  async listRolesForUsers(
    @Body(new ZodValidationPipe(ListUserRoleGrantsSchema)) body: ListUserRoleGrantsInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.listGrantsForUsers(getCurrentTransaction(), requireCtx(req), body.userIds);
  }

  @Get('users/:id/roles')
  @RequirePermission(PERMISSION_KEYS.ROLE_MANAGE)
  @Audited('user.roles.list', 'User')
  async listUserRoles(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.listGrantsForUser(getCurrentTransaction(), requireCtx(req), id);
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
