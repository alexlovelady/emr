import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CancelAppointmentSchema,
  CreateAppointmentSchema,
  CreateAppointmentSeriesSchema,
  ListAppointmentsQuerySchema,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type CreateAppointmentSeriesInput,
  type ListAppointmentsQuery,
} from './appointment.dto.js';
import { AppointmentService } from './appointment.service.js';

@Controller('api/v1/appointments')
export class AppointmentController {
  constructor(private readonly service: AppointmentService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.create', 'Appointment')
  async create(@Body(new ZodValidationPipe(CreateAppointmentSchema)) body: CreateAppointmentInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Post('series')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.create_series', 'Appointment')
  async createSeries(@Body(new ZodValidationPipe(CreateAppointmentSeriesSchema)) body: CreateAppointmentSeriesInput, @Req() req: FastifyRequest) {
    return this.service.createSeries(getCurrentTransaction(), requireCtx(req), body);
  }

  @Post('series/:seriesId/cancel')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.cancel_series', 'Appointment')
  async cancelSeries(
    @Param('seriesId') seriesId: string,
    @Body(new ZodValidationPipe(CancelAppointmentSchema)) body: CancelAppointmentInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.cancelSeries(getCurrentTransaction(), requireCtx(req), seriesId, body.reason ?? null);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.read', 'Appointment')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get(':id/resources')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.read_resources', 'Appointment')
  async getResources(@Param('id') id: string, @Req() req: FastifyRequest): Promise<{ resourceIds: string[] }> {
    const resourceIds = await this.service.getResourceIds(getCurrentTransaction(), requireCtx(req), id);
    return { resourceIds };
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.list', 'Appointment')
  async list(@Query(new ZodValidationPipe(ListAppointmentsQuerySchema)) query: ListAppointmentsQuery, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), {
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.practitionerId ? { practitionerId: query.practitionerId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.scheduledFrom ? { scheduledFrom: new Date(query.scheduledFrom) } : {}),
      ...(query.scheduledTo ? { scheduledTo: new Date(query.scheduledTo) } : {}),
    });
  }

  @Post(':id/confirm')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.confirm', 'Appointment')
  async confirm(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.confirm(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/check-in')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.check_in', 'Appointment')
  async checkIn(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.checkIn(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.cancel', 'Appointment')
  async cancel(@Param('id') id: string, @Body(new ZodValidationPipe(CancelAppointmentSchema)) body: CancelAppointmentInput, @Req() req: FastifyRequest) {
    return this.service.cancel(getCurrentTransaction(), requireCtx(req), id, body.reason ?? null);
  }

  @Post(':id/no-show')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.no_show', 'Appointment')
  async noShow(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.markNoShow(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/waitlist')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.waitlist', 'Appointment')
  async waitlist(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.waitlist(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/promote')
  @RequirePermission(PERMISSION_KEYS.APPOINTMENT_MANAGE)
  @Audited('appointment.promote', 'Appointment')
  async promote(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.promote(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
