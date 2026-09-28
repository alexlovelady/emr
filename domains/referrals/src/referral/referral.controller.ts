import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  CreateReferralSchema,
  UpdateReferralStatusSchema,
  type CreateReferralInput,
  type UpdateReferralStatusInput,
} from './referral.dto.js';
import { ReferralService } from './referral.service.js';

@Controller('api/v1/patients/:patientId/referrals')
export class PatientReferralController {
  constructor(private readonly service: ReferralService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.REFERRAL_MANAGE)
  @Audited('referral.create', 'Referral')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateReferralSchema)) body: CreateReferralInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('referral.list', 'Referral')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.listByPatient(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/referrals')
export class ReferralDetailController {
  constructor(private readonly service: ReferralService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('referral.read', 'Referral')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/status')
  @RequirePermission(PERMISSION_KEYS.REFERRAL_MANAGE)
  @Audited('referral.update_status', 'Referral')
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateReferralStatusSchema)) body: UpdateReferralStatusInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.updateStatus(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
