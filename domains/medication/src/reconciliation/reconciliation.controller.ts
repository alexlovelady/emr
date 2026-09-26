import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { RecordReconciliationSchema, type RecordReconciliationInput } from './reconciliation.dto.js';
import { MedicationReconciliationService } from './reconciliation.service.js';

@Controller('api/v1/patients/:patientId/medication-reconciliations')
export class MedicationReconciliationController {
  constructor(private readonly service: MedicationReconciliationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.MEDICATION_MANAGE)
  @Audited('medication.reconciliation.record', 'MedicationReconciliationEvent')
  async record(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(RecordReconciliationSchema)) body: RecordReconciliationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.record(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('medication.reconciliation.list', 'MedicationReconciliationEvent')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
