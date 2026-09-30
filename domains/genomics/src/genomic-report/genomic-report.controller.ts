import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateGenomicReportSchema,
  ReviewGenomicReportSchema,
  type CreateGenomicReportInput,
  type ReviewGenomicReportInput,
} from './genomic-report.dto.js';
import { GenomicReportService } from './genomic-report.service.js';

@Controller('api/v1/patients/:patientId/genomic-reports')
export class GenomicReportController {
  constructor(private readonly service: GenomicReportService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.GENOMIC_RESULT_MANAGE)
  @Audited('genomic_report.create', 'GenomicReport')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateGenomicReportSchema)) body: CreateGenomicReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('genomic_report.list', 'GenomicReport')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/genomic-reports')
export class GenomicReportDetailController {
  constructor(private readonly service: GenomicReportService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('genomic_report.read', 'GenomicReport')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/review')
  @RequirePermission(PERMISSION_KEYS.GENOMIC_RESULT_REVIEW)
  @Audited('genomic_report.review', 'GenomicReport')
  async review(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReviewGenomicReportSchema)) body: ReviewGenomicReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.review(getCurrentTransaction(), requireCtx(req), id, body.reviewStatus);
  }

  @Post(':id/amend')
  @RequirePermission(PERMISSION_KEYS.GENOMIC_RESULT_MANAGE)
  @Audited('genomic_report.amend', 'GenomicReport')
  async amend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateGenomicReportSchema)) body: CreateGenomicReportInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.amend(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

@Controller('api/v1/genomic-results')
export class GenomicResultsInboxController {
  constructor(private readonly service: GenomicReportService) {}

  @Get('inbox')
  @RequirePermission(PERMISSION_KEYS.GENOMIC_RESULT_REVIEW)
  @Audited('genomic_report.inbox', 'GenomicReport')
  async inbox(@Req() req: FastifyRequest) {
    return this.service.inbox(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
