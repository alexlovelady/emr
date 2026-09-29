import { Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { PortalExportService } from './portal-export.service.js';
import { ExportFormatSchema, type ExportFormat } from './portal-export.dto.js';

@Controller('api/v1/portal')
@SkipAuthz()
export class PortalExportController {
  private readonly service: PortalExportService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new PortalExportService(gateway);
  }

  @Post('patients/:patientId/export-requests')
  @Audited('portal_export.request', 'ExportRequest')
  async requestExport(
    @Param('patientId') patientId: string,
    @Query('format', new ZodValidationPipe(ExportFormatSchema)) format: ExportFormat,
    @Req() req: FastifyRequest,
  ) {
    return this.service.requestExport(getCurrentTransaction(), requirePortalCtx(req), patientId, format);
  }

  @Get('patients/:patientId/export-requests')
  @Audited('portal_export.list', 'ExportRequest')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('export-requests/:id')
  @Audited('portal_export.download', 'ExportRequest')
  async getDownloadUrl(@Param('id') id: string, @Req() req: FastifyRequest) {
    const url = await this.service.getDownloadUrl(getCurrentTransaction(), requirePortalCtx(req), id);
    return { url };
  }
}

function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
