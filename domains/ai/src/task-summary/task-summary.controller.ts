import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { TaskRepository } from '@ehr/tasks';
import { TaskSummarySchema, type TaskSummaryInput } from './task-summary.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "workflow/task summarization" — read-only digest of open tasks. */
@Controller('api/v1/ai/task-summary')
export class TaskSummaryController {
  private readonly service: AiGenerationService;
  private readonly taskRepo = new TaskRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.TASK_MANAGE)
  @Audited('ai_generation.propose_task_summary', 'AiGeneration')
  async propose(@Body(new ZodValidationPipe(TaskSummarySchema)) body: TaskSummaryInput, @Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const assignedToUserId = body.assignedToUserId ?? undefined;
    const patientId = body.patientId ?? undefined;
    if (!assignedToUserId && !patientId) {
      throw new ValidationError('Task summary requires assignedToUserId or patientId to scope the query');
    }

    const tasks = await this.taskRepo.list(trx, ctx.tenantId, {
      ...(assignedToUserId ? { assignedToUserId } : {}),
      ...(patientId ? { patientId } : {}),
      status: 'open',
    });

    const context: AiContextItem[] = tasks.map((t) => ({
      ref: `Task/${t.id}`,
      data: { title: t.title, taskType: t.taskType, priority: t.priority, dueAt: t.dueAt },
    }));

    const row = await this.service.propose(trx, ctx, {
      feature: 'task_summary',
      promptTemplateId: 'task-summary-v1',
      patientId: patientId ?? null,
      subjectType: null,
      subjectId: null,
      inputText: 'Summarize these open tasks.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
