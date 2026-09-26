import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { NotificationGateway } from '@ehr/notification-adapter';
import { CreateMessageThreadSchema, ReplyMessageSchema, type CreateMessageThreadInput, type ReplyMessageInput } from './message-thread.dto.js';
import { MessageThreadService } from './message-thread.service.js';
import { NOTIFICATION_GATEWAY } from '../notification-gateway.token.js';

@Controller('api/v1/patients/:patientId/message-threads')
export class StaffMessageThreadController {
  private readonly service: MessageThreadService;

  constructor(@Inject(NOTIFICATION_GATEWAY) gateway: NotificationGateway) {
    this.service = new MessageThreadService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('message_thread.create', 'MessageThread')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateMessageThreadSchema)) body: CreateMessageThreadInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.createThreadAsStaff(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('message_thread.list', 'MessageThread')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listThreadsAsStaff(getCurrentTransaction(), requireCtx(req), patientId);
  }

  @Get(':threadId/messages')
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('message.list', 'Message')
  async listMessages(@Param('threadId') threadId: string, @Req() req: FastifyRequest) {
    return this.service.listMessagesAsStaff(getCurrentTransaction(), requireCtx(req), threadId);
  }

  @Post(':threadId/messages')
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('message.create', 'Message')
  async reply(
    @Param('threadId') threadId: string,
    @Body(new ZodValidationPipe(ReplyMessageSchema)) body: ReplyMessageInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.replyAsStaff(getCurrentTransaction(), requireCtx(req), threadId, body);
  }

  @Post(':threadId/read')
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('message.mark_read', 'Message')
  async markRead(@Param('threadId') threadId: string, @Req() req: FastifyRequest): Promise<void> {
    await this.service.markReadAsStaff(getCurrentTransaction(), requireCtx(req), threadId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
