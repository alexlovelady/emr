import { Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import type { AiGateway } from '@ehr/ai-adapter';
import { ChargeRepository } from '@ehr/billing';
import { buildCodingContext } from './build-coding-context.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';
import { requireCtx } from './coding-suggestion.controller.js';

/**
 * Athelas-parity pass: the original `CodingSuggestionController` is a generic per-encounter report
 * a coder has to separately think to run. This charge-scoped sibling is the actual "wired into
 * charge capture" piece — callable directly from the coding queue for a specific draft charge, so
 * the suggestion appears exactly where and when a coder is doing the work, not on a separate
 * screen. Still never creates/edits the charge itself — `POST /charges/:id/finalize-coding`'s new
 * `sourceAiGenerationId` field (migration 0039) is how a coder records that they used this
 * suggestion, after reviewing it, same "propose then human decides" shape as every other AI feature
 * in this codebase.
 */
@Controller('api/v1/charges/:chargeId/ai/coding-suggestion')
export class ChargeCodingSuggestionController {
  private readonly service: AiGenerationService;
  private readonly chargeRepo = new ChargeRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.CODING_REVIEW)
  @Audited('ai_generation.propose_coding_suggestion', 'AiGeneration')
  async propose(@Param('chargeId') chargeId: string, @Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const charge = await this.chargeRepo.findById(trx, ctx.tenantId, chargeId);
    if (!charge) throw new NotFoundError('Charge not found', { chargeId });

    const context = await buildCodingContext(trx, ctx.tenantId, charge.encounterId);

    const row = await this.service.propose(trx, ctx, {
      feature: 'coding_suggestion',
      promptTemplateId: 'coding-suggestion-v1',
      patientId: charge.patientId,
      subjectType: 'Charge',
      subjectId: charge.id,
      inputText: `Suggest CPT/ICD-10 codes for charge ${charge.id} (currently ${charge.codeSystem}:${charge.code}).`,
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}
