import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { NotificationGateway } from '@ehr/notification-adapter';
import { CreateMessageThreadSchema, ReplyMessageSchema, type CreateMessageThreadInput, type ReplyMessageInput } from './message-thread.dto.js';
import { MessageThreadService } from './message-thread.service.js';
import { NOTIFICATION_GATEWAY } from '../notification-gateway.token.js';

/**
 * Portal-facing counterpart to `StaffMessageThreadController` over the same service/tables.
 * `@SkipAuthz()` (class-level, matching `AuthController`'s precedent) since a `'patient'` actor can
 * never pass `@ehr/authz`'s staff-only `rolePermissionLayer` — every method here relies on
 * `MessageThreadService`'s own `ConsentService.assertAccess()` call instead.
 */
@Controller('api/v1/portal/patients/:patientId/message-threads')
@SkipAuthz()
export class PortalMessageThreadController {
  private readonly service: MessageThreadService;

  constructor(@Inject(NOTIFICATION_GATEWAY) gateway: NotificationGateway) {
    this.service = new MessageThreadService(gateway);
  }

  @Post()
  @Audited('message_thread.create', 'MessageThread')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateMessageThreadSchema)) body: CreateMessageThreadInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.createThreadAsPortal(getCurrentTransaction(), requirePortalCtx(req), patientId, body);
  }

  @Get()
  @Audited('message_thread.list', 'MessageThread')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listThreadsAsPortal(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get(':threadId/messages')
  @Audited('message.list', 'Message')
  async listMessages(@Param('threadId') threadId: string, @Req() req: FastifyRequest) {
    return this.service.listMessagesAsPortal(getCurrentTransaction(), requirePortalCtx(req), threadId);
  }

  @Post(':threadId/messages')
  @Audited('message.create', 'Message')
  async reply(
    @Param('threadId') threadId: string,
    @Body(new ZodValidationPipe(ReplyMessageSchema)) body: ReplyMessageInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.replyAsPortal(getCurrentTransaction(), requirePortalCtx(req), threadId, body);
  }

  @Post(':threadId/read')
  @Audited('message.mark_read', 'Message')
  async markRead(@Param('threadId') threadId: string, @Req() req: FastifyRequest): Promise<void> {
    await this.service.markReadAsPortal(getCurrentTransaction(), requirePortalCtx(req), threadId);
  }
}

/** Rejects a valid staff token presented on a portal route (defense in depth beyond the hook). */
function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
