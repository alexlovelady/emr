import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateProcedureSchema, type CreateProcedureInput } from './procedure.dto.js';
import { ProcedureService } from './procedure.service.js';

@Controller('api/v1/encounters/:encounterId/procedures')
export class ProcedureController {
  constructor(private readonly service: ProcedureService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.PROCEDURE_MANAGE)
  @Audited('procedure.create', 'Procedure')
  async create(
    @Param('encounterId') encounterId: string,
    @Body(new ZodValidationPipe(CreateProcedureSchema)) body: CreateProcedureInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), encounterId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('procedure.list', 'Procedure')
  async list(@Param('encounterId') encounterId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), encounterId);
  }
}

@Controller('api/v1/procedures')
export class ProcedureDetailController {
  constructor(private readonly service: ProcedureService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('procedure.read', 'Procedure')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
