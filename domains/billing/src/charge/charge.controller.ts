import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateChargeSchema, FinalizeChargeCodingSchema, type CreateChargeInput, type FinalizeChargeCodingInput } from './charge.dto.js';
import { ChargeService } from './charge.service.js';

@Controller('api/v1/patients/:patientId/charges')
export class ChargeController {
  constructor(private readonly service: ChargeService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.CHARGE_CAPTURE)
  @Audited('charge.create', 'Charge')
  async create(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(CreateChargeSchema)) body: CreateChargeInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('charge.list', 'Charge')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/charges')
export class ChargeDetailController {
  constructor(private readonly service: ChargeService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('charge.read', 'Charge')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/finalize-coding')
  @RequirePermission(PERMISSION_KEYS.CODING_REVIEW)
  @Audited('charge.finalize_coding', 'Charge')
  async finalizeCoding(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(FinalizeChargeCodingSchema)) body: FinalizeChargeCodingInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.finalizeCoding(getCurrentTransaction(), requireCtx(req), id, body);
  }
}

@Controller('api/v1/coding-queue')
export class CodingQueueController {
  constructor(private readonly service: ChargeService) {}

  @Get()
  @RequirePermission(PERMISSION_KEYS.CODING_REVIEW)
  @Audited('charge.coding_queue', 'Charge')
  async codingQueue(@Req() req: FastifyRequest) {
    return this.service.codingQueue(getCurrentTransaction(), requireCtx(req));
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
