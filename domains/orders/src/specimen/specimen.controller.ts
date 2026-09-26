import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateSpecimenSchema, type CreateSpecimenInput } from './specimen.dto.js';
import { SpecimenService } from './specimen.service.js';

@Controller('api/v1/orders/:orderId/specimens')
export class SpecimenController {
  constructor(private readonly service: SpecimenService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.ORDER_MANAGE)
  @Audited('specimen.create', 'Specimen')
  async create(@Param('orderId') orderId: string, @Body(new ZodValidationPipe(CreateSpecimenSchema)) body: CreateSpecimenInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), orderId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('specimen.list', 'Specimen')
  async list(@Param('orderId') orderId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), orderId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
