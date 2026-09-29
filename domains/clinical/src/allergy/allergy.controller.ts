import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateAllergySchema, UpdateAllergySchema, type CreateAllergyInput, type UpdateAllergyInput } from './allergy.dto.js';
import { AllergyService } from './allergy.service.js';

@Controller('api/v1/patients/:patientId/allergies')
export class AllergyController {
  constructor(private readonly service: AllergyService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.ALLERGY_MANAGE)
  @Audited('allergy.create', 'Allergy')
  async create(@Param('patientId') patientId: string, @Body(new ZodValidationPipe(CreateAllergySchema)) body: CreateAllergyInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('allergy.list', 'Allergy')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/allergies')
export class AllergyDetailController {
  constructor(private readonly service: AllergyService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('allergy.read', 'Allergy')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Put(':id')
  @RequirePermission(PERMISSION_KEYS.ALLERGY_MANAGE)
  @Audited('allergy.update', 'Allergy')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateAllergySchema)) body: UpdateAllergyInput, @Req() req: FastifyRequest) {
    return this.service.update(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post(':id/resolve')
  @RequirePermission(PERMISSION_KEYS.ALLERGY_MANAGE)
  @Audited('allergy.resolve', 'Allergy')
  async resolve(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.resolve(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
