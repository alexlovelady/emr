import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { EncounterRepository, ObservationRepository, ProcedureRepository, ProblemRepository, AllergyRepository, NoteRepository } from '@ehr/clinical';
import { MedicationRepository } from '@ehr/medication';
import { EncounterSummarySchema, type EncounterSummaryInput } from './encounter-summary.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/** EHR_BUILD_SPEC.md §15.2's "encounter summary draft" — read-only; never writes a Note. */
@Controller('api/v1/encounters/:encounterId/ai/summary')
export class EncounterSummaryController {
  private readonly service: AiGenerationService;
  private readonly encounterRepo = new EncounterRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly procedureRepo = new ProcedureRepository();
  private readonly problemRepo = new ProblemRepository();
  private readonly allergyRepo = new AllergyRepository();
  private readonly medicationRepo = new MedicationRepository();
  private readonly noteRepo = new NoteRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.NOTE_CREATE)
  @Audited('ai_generation.propose_encounter_summary', 'AiGeneration')
  async propose(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(EncounterSummarySchema)) body: EncounterSummaryInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, encounterId);
    if (!encounter) throw new NotFoundError('Encounter not found', { encounterId });

    const [observations, procedures, problems, allergies, medications, notes] = await Promise.all([
      this.observationRepo.listByEncounter(trx, ctx.tenantId, encounterId),
      this.procedureRepo.listByEncounter(trx, ctx.tenantId, encounterId),
      this.problemRepo.listActiveByPatient(trx, ctx.tenantId, encounter.patientId),
      this.allergyRepo.listActiveByPatient(trx, ctx.tenantId, encounter.patientId),
      this.medicationRepo.listActiveByPatient(trx, ctx.tenantId, encounter.patientId),
      this.noteRepo.listByEncounter(trx, ctx.tenantId, encounterId),
    ]);
    const signedNotes = notes.filter((n) => n.status === 'signed');

    const context: AiContextItem[] = [
      { ref: `Encounter/${encounter.id}`, data: { encounterType: encounter.encounterType, chiefComplaint: encounter.chiefComplaint } },
      ...observations.map((o) => ({ ref: `Observation/${o.id}`, data: { code: o.code, displayName: o.displayName, value: o.valueQuantity ?? o.valueText } })),
      ...procedures.map((p) => ({ ref: `Procedure/${p.id}`, data: { code: p.code, displayName: p.displayName } })),
      ...problems.map((p) => ({ ref: `Problem/${p.id}`, data: { displayName: p.displayName, code: p.code } })),
      ...allergies.map((a) => ({ ref: `Allergy/${a.id}`, data: { substance: a.substance, severity: a.severity } })),
      ...medications.map((m) => ({ ref: `Medication/${m.id}`, data: { medicationName: m.medicationName, dose: m.dose } })),
      ...signedNotes.map((n) => ({ ref: `Note/${n.id}`, data: { noteType: n.noteType } })),
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'encounter_summary',
      promptTemplateId: 'encounter-summary-v1',
      patientId: encounter.patientId,
      subjectType: 'Encounter',
      subjectId: encounter.id,
      inputText: body.instructions ?? 'Summarize this encounter.',
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
