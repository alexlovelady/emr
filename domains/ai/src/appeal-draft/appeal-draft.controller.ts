import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { DenialRepository, ClaimRepository } from '@ehr/claims';
import { ChargeRepository } from '@ehr/billing';
import { AppealDraftSchema, type AppealDraftInput } from './appeal-draft.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * EHR_BUILD_SPEC.md §15.2 territory, same shape as `DenialSummaryController` — this drafts the
 * appeal argument itself rather than just explaining the denial. Read-only: `@ehr/claims`'s
 * `AppealService.create()` is the only thing that ever creates a real Appeal row, and it's always
 * an explicit human call (optionally passing this draft's `sourceAiGenerationId` for traceability,
 * with or without edits) — never triggered automatically from here.
 */
@Controller('api/v1/denials/:denialId/ai/appeal-draft')
export class AppealDraftController {
  private readonly service: AiGenerationService;
  private readonly denialRepo = new DenialRepository();
  private readonly claimRepo = new ClaimRepository();
  private readonly chargeRepo = new ChargeRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('ai_generation.propose_appeal_draft', 'AiGeneration')
  async propose(
    @Param('denialId') denialId: string,
    @Body(new ZodValidationPipe(AppealDraftSchema)) body: AppealDraftInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const denial = await this.denialRepo.findById(trx, ctx.tenantId, denialId);
    if (!denial) throw new NotFoundError('Denial not found', { denialId });
    const claim = await this.claimRepo.findById(trx, ctx.tenantId, denial.claimId);
    if (!claim) throw new NotFoundError('Claim not found', { claimId: denial.claimId });
    const charges = await this.chargeRepo.listByClaim(trx, ctx.tenantId, claim.id);

    const context: AiContextItem[] = [
      { ref: `Denial/${denial.id}`, data: { reasonCode: denial.denialReasonCode, reasonText: denial.denialReasonText } },
      { ref: `Claim/${claim.id}`, data: { totalChargeAmount: claim.totalChargeAmount, status: claim.status } },
      ...charges.map((c) => ({ ref: `Charge/${c.id}`, data: { code: c.code, codeSystem: c.codeSystem, diagnosisCodes: c.diagnosisCodes, description: c.description } })),
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'appeal_draft',
      promptTemplateId: 'appeal-draft-v1',
      patientId: claim.patientId,
      subjectType: 'Denial',
      subjectId: denial.id,
      inputText: body.instructions ?? 'Draft an appeal letter arguing why this denial should be overturned, grounded on the claim and charge details.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
