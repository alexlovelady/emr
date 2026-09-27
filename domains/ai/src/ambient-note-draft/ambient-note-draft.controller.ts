import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { EncounterRepository, ObservationRepository, ProcedureRepository } from '@ehr/clinical';
import { AmbientNoteDraftSchema, type AmbientNoteDraftInput } from './ambient-note-draft.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "ambient note draft" — never creates/signs a Note; a clinician pastes the (edited) draft into the existing note-authoring flow themselves. */
@Controller('api/v1/encounters/:encounterId/ai/note-draft')
export class AmbientNoteDraftController {
  private readonly service: AiGenerationService;
  private readonly encounterRepo = new EncounterRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly procedureRepo = new ProcedureRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('ai_generation.propose_note_draft', 'AiGeneration')
  async propose(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(AmbientNoteDraftSchema)) body: AmbientNoteDraftInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const [observations, procedures] = await Promise.all([
      this.observationRepo.listByEncounter(trx, ctx.tenantId, encounterId),
      this.procedureRepo.listByEncounter(trx, ctx.tenantId, encounterId),
    ]);

    const context: AiContextItem[] = [
      { ref: `Encounter/${encounter.id}`, data: { encounterType: encounter.encounterType, chiefComplaint: encounter.chiefComplaint } },
      ...observations.map((o) => ({ ref: `Observation/${o.id}`, data: { code: o.code, displayName: o.displayName, value: o.valueQuantity ?? o.valueText, unit: o.unit } })),
      ...procedures.map((p) => ({ ref: `Procedure/${p.id}`, data: { code: p.code, displayName: p.displayName } })),
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'ambient_note_draft',
      promptTemplateId: 'note-draft-v1',
      patientId: encounter.patientId,
      subjectType: 'Encounter',
      subjectId: encounter.id,
      inputText: body.instructions ?? 'Draft a clinical note for this encounter.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
