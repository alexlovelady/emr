import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { MessageThreadRepository } from '@ehr/messaging';
import { MessageDraftSchema, type MessageDraftInput } from './message-draft.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * EHR_BUILD_SPEC.md §15.2's "patient-message drafting" — helps STAFF draft a reply to a portal
 * message. Never posts to the thread itself; staff pastes the (possibly edited) draft into the
 * existing `POST /patients/{patientId}/message-threads/{threadId}/messages` route themselves.
 */
@Controller('api/v1/message-threads/:threadId/ai/draft-reply')
export class MessageDraftController {
  private readonly service: AiGenerationService;
  private readonly threadRepo = new MessageThreadRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.MESSAGE_MANAGE)
  @Audited('ai_generation.propose_message_draft', 'AiGeneration')
  async propose(
    @Param('threadId') threadId: string,
    @Body(new ZodValidationPipe(MessageDraftSchema)) body: MessageDraftInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const thread = await this.threadRepo.findById(trx, ctx.tenantId, threadId);
    if (!thread) throw new NotFoundError('Message thread not found', { threadId });

    const messages = await this.threadRepo.listMessages(trx, ctx.tenantId, threadId);

    const context: AiContextItem[] = messages.map((m) => ({
      ref: `Message/${m.id}`,
      data: { senderType: m.senderType, body: m.body },
    }));

    const row = await this.service.propose(trx, ctx, {
      feature: 'message_draft',
      promptTemplateId: 'message-draft-v1',
      patientId: thread.patientId,
      subjectType: 'MessageThread',
      subjectId: thread.id,
      inputText: body.instructions ?? 'Draft a reply to the most recent portal message.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
