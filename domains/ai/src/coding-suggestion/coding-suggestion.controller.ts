import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway } from '@ehr/ai-adapter';
import { EncounterRepository } from '@ehr/clinical';
import { CodingSuggestionSchema, type CodingSuggestionInput } from './coding-suggestion.dto.js';
import { buildCodingContext } from './build-coding-context.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "coding suggestions" — never creates/edits a Charge; a coder manually
 * enters codes via the existing charge-capture flow. See `ChargeCodingSuggestionController` for the
 * charge-scoped sibling wired directly into the coding queue. */
@Controller('api/v1/encounters/:encounterId/ai/coding-suggestions')
export class CodingSuggestionController {
  private readonly service: AiGenerationService;
  private readonly encounterRepo = new EncounterRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.CODING_REVIEW)
  @Audited('ai_generation.propose_coding_suggestion', 'AiGeneration')
  async propose(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(CodingSuggestionSchema)) body: CodingSuggestionInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const context = await buildCodingContext(trx, ctx.tenantId, encounterId);

    const row = await this.service.propose(trx, ctx, {
      feature: 'coding_suggestion',
      promptTemplateId: 'coding-suggestion-v1',
      patientId: encounter.patientId,
      subjectType: 'Encounter',
      subjectId: encounter.id,
      inputText: body.instructions ?? 'Suggest CPT/ICD-10 codes for this encounter.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

export function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
