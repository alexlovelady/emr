import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { PortalChartService } from './portal-chart.service.js';

@Controller('api/v1/portal/patients/:patientId')
@SkipAuthz()
export class PortalChartController {
  private readonly service: PortalChartService;

  constructor(@Inject(OBJECT_STORAGE_GATEWAY) gateway: ObjectStorageGateway) {
    this.service = new PortalChartService(gateway);
  }

  @Get('appointments')
  @Audited('portal_chart.appointments', 'Appointment')
  async listAppointments(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listAppointments(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('results')
  @Audited('portal_chart.results', 'DiagnosticReport')
  async listResults(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listResults(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('notes')
  @Audited('portal_chart.notes', 'Note')
  async listNotes(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listNotes(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('problems')
  @Audited('portal_chart.problems', 'Problem')
  async listProblems(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listProblems(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('allergies')
  @Audited('portal_chart.allergies', 'Allergy')
  async listAllergies(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listAllergies(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('medications')
  @Audited('portal_chart.medications', 'Medication')
  async listMedications(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listMedications(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('documents')
  @Audited('portal_chart.documents', 'Document')
  async listDocuments(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listDocuments(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('ledger')
  @Audited('portal_chart.ledger', 'LedgerEntry')
  async getLedger(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.getLedger(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }
}

function requirePortalCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext;
}
