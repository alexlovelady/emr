import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { DenialRepository, ClaimRepository } from '@ehr/claims';
import { DenialSummarySchema, type DenialSummaryInput } from './denial-summary.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "denial explanation summarization" — read-only; `DenialService.resolve()` remains a fully separate, human-driven call. */
@Controller('api/v1/denials/:denialId/ai/summary')
export class DenialSummaryController {
  private readonly service: AiGenerationService;
  private readonly denialRepo = new DenialRepository();
  private readonly claimRepo = new ClaimRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('ai_generation.propose_denial_summary', 'AiGeneration')
  async propose(
    @Param('denialId') denialId: string,
    @Body(new ZodValidationPipe(DenialSummarySchema)) body: DenialSummaryInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const denial = await this.denialRepo.findById(trx, ctx.tenantId, denialId);
    if (!denial) throw new NotFoundError('Denial not found', { denialId });
    const claim = await this.claimRepo.findById(trx, ctx.tenantId, denial.claimId);
    if (!claim) throw new NotFoundError('Claim not found', { claimId: denial.claimId });

    const context: AiContextItem[] = [
      { ref: `Denial/${denial.id}`, data: { reasonCode: denial.denialReasonCode, reasonText: denial.denialReasonText } },
      { ref: `Claim/${claim.id}`, data: { totalChargeAmount: claim.totalChargeAmount, status: claim.status } },
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'denial_summary',
      promptTemplateId: 'denial-summary-v1',
      patientId: claim.patientId,
      subjectType: 'Denial',
      subjectId: denial.id,
      inputText: body.instructions ?? 'Explain this denial in plain language and suggest a next step.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
