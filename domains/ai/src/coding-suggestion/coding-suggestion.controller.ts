import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { EncounterRepository, ObservationRepository, ProcedureRepository, ProblemRepository } from '@ehr/clinical';
import { CodingSuggestionSchema, type CodingSuggestionInput } from './coding-suggestion.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "coding suggestions" — never creates/edits a Charge; a coder manually enters codes via the existing charge-capture flow. */
@Controller('api/v1/encounters/:encounterId/ai/coding-suggestions')
export class CodingSuggestionController {
  private readonly service: AiGenerationService;
  private readonly encounterRepo = new EncounterRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly procedureRepo = new ProcedureRepository();
  private readonly problemRepo = new ProblemRepository();

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

    const [problems, procedures, observations] = await Promise.all([
      this.problemRepo.listActiveByPatient(trx, ctx.tenantId, encounter.patientId),
      this.procedureRepo.listByEncounter(trx, ctx.tenantId, encounterId),
      this.observationRepo.listByEncounter(trx, ctx.tenantId, encounterId),
    ]);

    const context: AiContextItem[] = [
      ...problems.map((p) => ({ ref: `Problem/${p.id}`, data: { displayName: p.displayName, code: p.code, codeSystem: p.codeSystem } })),
      ...procedures.map((p) => ({ ref: `Procedure/${p.id}`, data: { code: p.code, displayName: p.displayName } })),
      ...observations.map((o) => ({ ref: `Observation/${o.id}`, data: { code: o.code, displayName: o.displayName } })),
    ];

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

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
