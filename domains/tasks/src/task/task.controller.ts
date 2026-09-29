import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateTaskSchema, ReassignTaskSchema, type CreateTaskInput, type ReassignTaskInput } from './task.dto.js';
import { TaskService } from './task.service.js';

@Controller('api/v1/tasks')
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.create', 'Task')
  async create(@Body(new ZodValidationPipe(CreateTaskSchema)) body: CreateTaskInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.read', 'Task')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.list', 'Task')
  async list(
    @Query('patientId') patientId: string | undefined,
    @Query('assignedToUserId') assignedToUserId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), {
      ...(patientId ? { patientId } : {}),
      ...(assignedToUserId ? { assignedToUserId } : {}),
      ...(status ? { status } : {}),
    });
  }

  @Post(':id/reassign')
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.reassign', 'Task')
  async reassign(@Param('id') id: string, @Body(new ZodValidationPipe(ReassignTaskSchema)) body: ReassignTaskInput, @Req() req: FastifyRequest) {
    return this.service.reassign(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post(':id/complete')
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.complete', 'Task')
  async complete(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.complete(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('task.cancel', 'Task')
  async cancel(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.cancel(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
