import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateAppealSchema, DecideAppealSchema, type CreateAppealInput, type DecideAppealInput } from './appeal.dto.js';
import { AppealService } from './appeal.service.js';

@Controller('api/v1/denials/:denialId/appeals')
export class DenialAppealController {
  constructor(private readonly service: AppealService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('appeal.create', 'Appeal')
  async create(
    @Param('denialId') denialId: string,
    @Body(new ZodValidationPipe(CreateAppealSchema)) body: CreateAppealInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), denialId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('appeal.list', 'Appeal')
  async list(@Param('denialId') denialId: string, @Req() req: FastifyRequest) {
    return this.service.listByDenial(getCurrentTransaction(), requireCtx(req), denialId);
  }
}

@Controller('api/v1/appeals')
export class AppealController {
  constructor(private readonly service: AppealService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('appeal.read', 'Appeal')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('appeal.submit', 'Appeal')
  async submit(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.submit(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/decide')
  @RequirePermission(PERMISSION_KEYS.DENIAL_MANAGE)
  @Audited('appeal.decide', 'Appeal')
  async decide(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DecideAppealSchema)) body: DecideAppealInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.decide(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
