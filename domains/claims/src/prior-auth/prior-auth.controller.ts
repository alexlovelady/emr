import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreatePriorAuthorizationSchema,
  RecordPriorAuthDecisionSchema,
  CancelPriorAuthorizationSchema,
  type CreatePriorAuthorizationInput,
  type RecordPriorAuthDecisionInput,
  type CancelPriorAuthorizationInput,
} from './prior-auth.dto.js';
import { PriorAuthorizationService } from './prior-auth.service.js';

@Controller('api/v1/patients/:patientId/prior-authorizations')
export class PatientPriorAuthController {
  constructor(private readonly service: PriorAuthorizationService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PRIOR_AUTH_MANAGE)
  @Audited('prior_auth.create', 'PriorAuthorization')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreatePriorAuthorizationSchema)) body: CreatePriorAuthorizationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('prior_auth.list', 'PriorAuthorization')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/prior-authorizations')
export class PriorAuthDetailController {
  constructor(private readonly service: PriorAuthorizationService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('prior_auth.read', 'PriorAuthorization')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/decision')
  @RequirePermission(PERMISSION_KEYS.PRIOR_AUTH_MANAGE)
  @Audited('prior_auth.record_decision', 'PriorAuthorization')
  async recordDecision(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RecordPriorAuthDecisionSchema)) body: RecordPriorAuthDecisionInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.recordDecision(getCurrentTransaction(), requireCtx(req), id, body);
  }

  @Post(':id/expire')
  @RequirePermission(PERMISSION_KEYS.PRIOR_AUTH_MANAGE)
  @Audited('prior_auth.expire', 'PriorAuthorization')
  async expire(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.expire(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSION_KEYS.PRIOR_AUTH_MANAGE)
  @Audited('prior_auth.cancel', 'PriorAuthorization')
  async cancel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelPriorAuthorizationSchema)) body: CancelPriorAuthorizationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.cancel(getCurrentTransaction(), requireCtx(req), id, body.notes ?? null);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
