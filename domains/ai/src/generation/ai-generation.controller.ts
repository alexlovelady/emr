import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway } from '@ehr/ai-adapter';
import { AcceptAiGenerationSchema, type AcceptAiGenerationInput } from './ai-generation.dto.js';
import { AiGenerationService } from './ai-generation.service.js';
import { toProvenance } from './ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * Generic read/accept/reject surface shared by all 8 features — each feature's own controller only
 * ever calls `AiGenerationService.propose()`; every review action lands here.
 */
@Controller('api/v1/ai-generations')
export class AiGenerationController {
  private readonly service: AiGenerationService;

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.AI_GENERATION_MANAGE)
  @Audited('ai_generation.read', 'AiGeneration')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    const row = await this.service.getById(getCurrentTransaction(), requireCtx(req), id);
    return { ...row, provenance: toProvenance(row) };
  }

  @Post(':id/accept')
  @RequirePermission(PERMISSION_KEYS.AI_GENERATION_MANAGE)
  @Audited('ai_generation.accept', 'AiGeneration')
  async accept(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AcceptAiGenerationSchema)) body: AcceptAiGenerationInput,
    @Req() req: FastifyRequest,
  ) {
    const row = await this.service.accept(getCurrentTransaction(), requireCtx(req), id, body.editedOutputText ?? null);
    return { ...row, provenance: toProvenance(row) };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSION_KEYS.AI_GENERATION_MANAGE)
  @Audited('ai_generation.reject', 'AiGeneration')
  async reject(@Param('id') id: string, @Req() req: FastifyRequest) {
    const row = await this.service.reject(getCurrentTransaction(), requireCtx(req), id);
    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
