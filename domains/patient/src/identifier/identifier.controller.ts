import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreatePatientIdentifierSchema, type CreatePatientIdentifierInput } from './identifier.dto.js';
import { PatientIdentifierService } from './identifier.service.js';

@Controller('api/v1/patients/:patientId/identifiers')
export class PatientIdentifierController {
  constructor(private readonly service: PatientIdentifierService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PATIENT_WRITE_DEMOGRAPHICS)
  @Audited('patient.identifier.create', 'PatientIdentifier')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreatePatientIdentifierSchema)) body: CreatePatientIdentifierInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_DEMOGRAPHICS)
  @Audited('patient.identifier.list', 'PatientIdentifier')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
