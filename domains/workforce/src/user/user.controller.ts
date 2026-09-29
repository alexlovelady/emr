import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { PaginationQuerySchema, ZodValidationPipe, type PaginationQuery } from '@ehr/api-contracts';
import { CreateUserSchema, type CreateUserInput } from './user.dto.js';
import { UserService } from './user.service.js';

@Controller('api/v1/users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.USER_MANAGE)
  @Audited('user.create', 'User')
  async create(@Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.USER_MANAGE)
  @Audited('user.read', 'User')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.USER_MANAGE)
  @Audited('user.list', 'User')
  async list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), query);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
