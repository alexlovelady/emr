import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import type { PrescribingGateway } from '@ehr/erx-adapter';
import { CreatePrescriptionSchema, DenyRefillSchema, type CreatePrescriptionInput, type DenyRefillInput } from './prescription.dto.js';
import { PrescriptionService } from './prescription.service.js';
import { ERX_GATEWAY } from '../erx-gateway.token.js';

@Controller('api/v1/patients/:patientId/prescriptions')
export class PrescriptionController {
  private readonly service: PrescriptionService;

  constructor(@Inject(ERX_GATEWAY) gateway: PrescribingGateway) {
    this.service = new PrescriptionService(gateway);
  }

  @Post()
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('prescription.create', 'Prescription')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreatePrescriptionSchema)) body: CreatePrescriptionInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body, false);
  }

  @Post('controlled')
  @RequirePermission(PERMISSION_KEYS.CONTROLLED_SUBSTANCE_PRESCRIBE)
  @Audited('prescription.create_controlled', 'Prescription')
  async createControlled(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreatePrescriptionSchema)) body: CreatePrescriptionInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body, true);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('prescription.list', 'Prescription')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/prescriptions')
export class PrescriptionDetailController {
  private readonly service: PrescriptionService;

  constructor(@Inject(ERX_GATEWAY) gateway: PrescribingGateway) {
    this.service = new PrescriptionService(gateway);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('prescription.read', 'Prescription')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('prescription.cancel', 'Prescription')
  async cancel(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.cancel(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/refill-requests')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('prescription.request_refill', 'Prescription')
  async requestRefill(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.requestRefill(getCurrentTransaction(), requireCtx(req), id);
  }
}

@Controller('api/v1/prescription-refill-requests')
export class RefillRequestController {
  private readonly service: PrescriptionService;

  constructor(@Inject(ERX_GATEWAY) gateway: PrescribingGateway) {
    this.service = new PrescriptionService(gateway);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('prescription_refill_request.approve', 'PrescriptionRefillRequest')
  async approve(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.respondToRefill(getCurrentTransaction(), requireCtx(req), id, { approved: true, denialReason: null });
  }

  @Post(':id/deny')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_PRESCRIBE)
  @Audited('prescription_refill_request.deny', 'PrescriptionRefillRequest')
  async deny(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DenyRefillSchema)) body: DenyRefillInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.respondToRefill(getCurrentTransaction(), requireCtx(req), id, { approved: false, denialReason: body.denialReason });
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
