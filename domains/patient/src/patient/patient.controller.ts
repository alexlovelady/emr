import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreatePatientSchema,
  FindDuplicatesQuerySchema,
  MergePatientsSchema,
  type CreatePatientInput,
  type FindDuplicatesQuery,
  type MergePatientsInput,
} from './patient.dto.js';
import { PatientService } from './patient.service.js';

@Controller('api/v1/patients')
export class PatientController {
  constructor(private readonly service: PatientService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PATIENT_WRITE_DEMOGRAPHICS)
  @Audited('patient.create', 'Patient')
  async create(@Body(new ZodValidationPipe(CreatePatientSchema)) body: CreatePatientInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  // Must be declared before ':id' so it isn't captured as an id param.
  @Get('duplicates')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_DEMOGRAPHICS)
  @Audited('patient.duplicates.search', 'Patient')
  async findDuplicates(@Query(new ZodValidationPipe(FindDuplicatesQuerySchema)) query: FindDuplicatesQuery, @Req() req: FastifyRequest) {
    return this.service.findDuplicates(getCurrentTransaction(), requireCtx(req), query);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_DEMOGRAPHICS)
  @Audited('patient.read', 'Patient')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_DEMOGRAPHICS)
  @Audited('patient.list', 'Patient')
  async list(@Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req));
  }

  @Post(':id/merge')
  @RequirePermission(PERMISSION_KEYS.PATIENT_MERGE)
  @Audited('patient.merge', 'Patient')
  async merge(@Param('id') id: string, @Body(new ZodValidationPipe(MergePatientsSchema)) body: MergePatientsInput, @Req() req: FastifyRequest) {
    return this.service.merge(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post('merges/:mergeId/reverse')
  @RequirePermission(PERMISSION_KEYS.PATIENT_MERGE)
  @Audited('patient.merge.reverse', 'Patient')
  async reverseMerge(@Param('mergeId') mergeId: string, @Req() req: FastifyRequest) {
    return this.service.reverseMerge(getCurrentTransaction(), requireCtx(req), mergeId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
