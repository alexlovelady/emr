import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { PatientRepository } from '@ehr/patient';
import { ProblemRepository, AllergyRepository, NoteRepository } from '@ehr/clinical';
import { MedicationRepository } from '@ehr/medication';
import { DiagnosticReportRepository } from '@ehr/results';
import { ChartQaSchema, type ChartQaInput } from './chart-qa.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * EHR_BUILD_SPEC.md §15.2's "chart Q&A grounded only in retrieved chart evidence" — mirrors
 * `domains/portal/src/chart/portal-chart.service.ts`'s retrieval exactly. `AiGenerationService`'s
 * zero-context guard makes an ungrounded answer structurally impossible.
 */
@Controller('api/v1/patients/:patientId/ai/chart-qa')
export class ChartQaController {
  private readonly service: AiGenerationService;
  private readonly patientRepo = new PatientRepository();
  private readonly problemRepo = new ProblemRepository();
  private readonly allergyRepo = new AllergyRepository();
  private readonly medicationRepo = new MedicationRepository();
  private readonly noteRepo = new NoteRepository();
  private readonly diagnosticReportRepo = new DiagnosticReportRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('ai_generation.propose_chart_qa', 'AiGeneration')
  async propose(@Param('patientId') patientId: string, @Body(new ZodValidationPipe(ChartQaSchema)) body: ChartQaInput, @Req() req: FastifyRequest) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const [problems, allergies, medications, notes, results] = await Promise.all([
      this.problemRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.allergyRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.medicationRepo.listActiveByPatient(trx, ctx.tenantId, patientId),
      this.noteRepo.listSignedByPatient(trx, ctx.tenantId, patientId),
      this.diagnosticReportRepo.listReleasedByPatient(trx, ctx.tenantId, patientId),
    ]);

    const context: AiContextItem[] = [
      ...problems.map((p) => ({ ref: `Problem/${p.id}`, data: { displayName: p.displayName, code: p.code } })),
      ...allergies.map((a) => ({ ref: `Allergy/${a.id}`, data: { substance: a.substance, severity: a.severity } })),
      ...medications.map((m) => ({ ref: `Medication/${m.id}`, data: { medicationName: m.medicationName, dose: m.dose } })),
      ...notes.slice(0, 10).map((n) => ({ ref: `Note/${n.id}`, data: { noteType: n.noteType } })),
      ...results.slice(0, 10).map((r) => ({ ref: `DiagnosticReport/${r.id}`, data: { displayName: r.displayName, conclusion: r.conclusion } })),
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'chart_qa',
      promptTemplateId: 'chart-qa-v1',
      patientId,
      subjectType: null,
      subjectId: null,
      inputText: body.question,
      context,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
