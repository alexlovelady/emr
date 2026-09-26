import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateMedicationSchema,
  DiscontinueMedicationSchema,
  type CreateMedicationInput,
  type DiscontinueMedicationInput,
} from './medication.dto.js';
import { MedicationService } from './medication.service.js';

@Controller('api/v1/patients/:patientId/medications')
export class MedicationController {
  constructor(private readonly service: MedicationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.MEDICATION_MANAGE)
  @Audited('medication.create', 'Medication')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateMedicationSchema)) body: CreateMedicationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('medication.list', 'Medication')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/medications')
export class MedicationDetailController {
  constructor(private readonly service: MedicationService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('medication.read', 'Medication')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/discontinue')
  @RequirePermission(PERMISSION_KEYS.MEDICATION_MANAGE)
  @Audited('medication.discontinue', 'Medication')
  async discontinue(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DiscontinueMedicationSchema)) body: DiscontinueMedicationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.discontinue(getCurrentTransaction(), requireCtx(req), id, body.stoppedAt ?? null);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
