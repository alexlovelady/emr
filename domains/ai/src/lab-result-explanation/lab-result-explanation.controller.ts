import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { AiGateway, AiContextItem } from '@ehr/ai-adapter';
import { DiagnosticReportRepository } from '@ehr/results';
import { LabResultExplanationSchema, type LabResultExplanationInput } from './lab-result-explanation.dto.js';
import { AiGenerationService } from '../generation/ai-generation.service.js';
import { toProvenance } from '../generation/ai-generation.repository.js';
import { AI_GATEWAY } from '../ai-gateway.token.js';

/**
 * Epic-parity item 3 ("Emmie" equivalent, reframed responsibly): drafts a plain-language
 * explanation of a released result for STAFF to review — never shown to the patient until a
 * clinician explicitly accepts it via the existing generic `POST /ai-generations/:id/accept`
 * review endpoint (`AI_GENERATION_MANAGE`-gated, same as all 8 other AI features). The patient-
 * facing read side lives in `domains/portal`'s `PortalChartService.getResultExplanation` — it only
 * ever returns an accepted generation, never this draft.
 */
@Controller('api/v1/diagnostic-reports/:reportId/ai/explanation')
export class LabResultExplanationController {
  private readonly service: AiGenerationService;
  private readonly reportRepo = new DiagnosticReportRepository();

  constructor(@Inject(AI_GATEWAY) gateway: AiGateway) {
    this.service = new AiGenerationService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.RESULT_REVIEW)
  @Audited('ai_generation.propose_lab_result_explanation', 'AiGeneration')
  async propose(
    @Param('reportId') reportId: string,
    @Body(new ZodValidationPipe(LabResultExplanationSchema)) body: LabResultExplanationInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requireCtx(req);
    const trx = getCurrentTransaction();

    const report = await this.reportRepo.findById(trx, ctx.tenantId, reportId);
    if (!report) throw new NotFoundError('Diagnostic report not found', { reportId });

    const context: AiContextItem[] = [
      {
        ref: `DiagnosticReport/${report.id}`,
        data: {
          displayName: report.displayName,
          conclusion: report.conclusion,
          abnormalFlag: report.abnormalFlag,
          criticalFlag: report.criticalFlag,
          issuedAt: report.issuedAt,
        },
      },
    ];

    const row = await this.service.propose(trx, ctx, {
      feature: 'lab_result_explanation',
      promptTemplateId: 'lab-result-explanation-v1',
      patientId: report.patientId,
      subjectType: 'DiagnosticReport',
      subjectId: report.id,
      inputText: body.instructions ?? `Explain this result in plain, reassuring language for the patient: ${report.displayName}.`,
      context,
      linkedDiagnosticReportId: report.id,
    });

    return { ...row, provenance: toProvenance(row) };
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
