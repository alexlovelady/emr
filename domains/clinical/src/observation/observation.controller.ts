import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateObservationSchema, type CreateObservationInput } from './observation.dto.js';
import { ObservationService } from './observation.service.js';

@Controller('api/v1/encounters/:encounterId/observations')
export class ObservationController {
  constructor(private readonly service: ObservationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.OBSERVATION_MANAGE)
  @Audited('observation.create', 'Observation')
  async create(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(CreateObservationSchema)) body: CreateObservationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), encounterId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('observation.list', 'Observation')
  async list(@Param('encounterId') encounterId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), encounterId);
  }
}

@Controller('api/v1/observations')
export class ObservationDetailController {
  constructor(private readonly service: ObservationService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('observation.read', 'Observation')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
