import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateDiagnosticReportSchema,
  ReviewDiagnosticReportSchema,
  type CreateDiagnosticReportInput,
  type ReviewDiagnosticReportInput,
} from './diagnostic-report.dto.js';
import { DiagnosticReportService } from './diagnostic-report.service.js';

@Controller('api/v1/patients/:patientId/diagnostic-reports')
export class DiagnosticReportController {
  constructor(private readonly service: DiagnosticReportService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.RESULT_MANAGE)
  @Audited('diagnostic_report.create', 'DiagnosticReport')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateDiagnosticReportSchema)) body: CreateDiagnosticReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('diagnostic_report.list', 'DiagnosticReport')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/diagnostic-reports')
export class DiagnosticReportDetailController {
  constructor(private readonly service: DiagnosticReportService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('diagnostic_report.read', 'DiagnosticReport')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/review')
  @RequirePermission(PERMISSION_KEYS.RESULT_REVIEW)
  @Audited('diagnostic_report.review', 'DiagnosticReport')
  async review(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReviewDiagnosticReportSchema)) body: ReviewDiagnosticReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.review(getCurrentTransaction(), requireCtx(req), id, body.reviewStatus);
  }

  @Post(':id/amend')
  @RequirePermission(PERMISSION_KEYS.RESULT_MANAGE)
  @Audited('diagnostic_report.amend', 'DiagnosticReport')
  async amend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateDiagnosticReportSchema)) body: CreateDiagnosticReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.amend(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

@Controller('api/v1/results')
export class ResultsInboxController {
  constructor(private readonly service: DiagnosticReportService) {}

  @Get('inbox')
  @RequirePermission(PERMISSION_KEYS.RESULT_REVIEW)
  @Audited('diagnostic_report.inbox', 'DiagnosticReport')
  async inbox(@Req() req: FastifyRequest) {
    return this.service.inbox(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
