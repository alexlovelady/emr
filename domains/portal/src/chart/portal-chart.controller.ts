import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { OBJECT_STORAGE_GATEWAY } from '@ehr/documents';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { PortalChartService } from './portal-chart.service.js';
import {
  PortalBookAppointmentSchema,
  PortalCancelAppointmentSchema,
  PortalUpdateAgendaSchema,
  type PortalBookAppointmentInput,
  type PortalCancelAppointmentInput,
  type PortalUpdateAgendaInput,
} from '../scheduling/portal-scheduling.dto.js';

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

  @Post('appointments')
  @Audited('portal_chart.book_appointment', 'Appointment')
  async bookAppointment(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(PortalBookAppointmentSchema)) body: PortalBookAppointmentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.bookAppointment(getCurrentTransaction(), requirePortalCtx(req), patientId, body);
  }

  @Post('appointments/:appointmentId/cancel')
  @Audited('portal_chart.cancel_appointment', 'Appointment')
  async cancelAppointment(
    @Param('patientId') patientId: string,
    @Param('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(PortalCancelAppointmentSchema)) body: PortalCancelAppointmentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.cancelAppointment(getCurrentTransaction(), requirePortalCtx(req), patientId, appointmentId, body.reason ?? null);
  }

  @Post('appointments/:appointmentId/agenda')
  @Audited('portal_chart.update_agenda', 'Appointment')
  async updateAgenda(
    @Param('patientId') patientId: string,
    @Param('appointmentId') appointmentId: string,
    @Body(new ZodValidationPipe(PortalUpdateAgendaSchema)) body: PortalUpdateAgendaInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.updateAppointmentAgenda(getCurrentTransaction(), requirePortalCtx(req), patientId, appointmentId, body.agenda);
  }

  @Get('results')
  @Audited('portal_chart.results', 'DiagnosticReport')
  async listResults(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listResults(getCurrentTransaction(), requirePortalCtx(req), patientId);
  }

  @Get('results/:reportId/explanation')
  @Audited('portal_chart.result_explanation', 'DiagnosticReport')
  async getResultExplanation(@Param('patientId') patientId: string, @Param('reportId') reportId: string, @Req() req: FastifyRequest) {
    return this.service.getResultExplanation(getCurrentTransaction(), requirePortalCtx(req), patientId, reportId);
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
