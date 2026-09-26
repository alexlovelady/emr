import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { CreateEncounterSchema, type CreateEncounterInput } from './encounter.dto.js';
import { EncounterService } from './encounter.service.js';

@Controller('api/v1/encounters')
export class EncounterController {
  constructor(private readonly service: EncounterService) {}

  @Post()
  @RequirePermission(PERMISSION_KEYS.ENCOUNTER_CREATE)
  @Audited('encounter.create', 'Encounter')
  async create(@Body(new ZodValidationPipe(CreateEncounterSchema)) body: CreateEncounterInput, @Req() req: FastifyRequest) {
    return this.service.create(getCurrentTransaction(), requireCtx(req), body);
  }

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('encounter.read', 'Encounter')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('encounter.list', 'Encounter')
  async list(@Query('patientId') patientId: string | undefined, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId ? { patientId } : {});
  }

  @Post(':id/start')
  @RequirePermission(PERMISSION_KEYS.ENCOUNTER_CREATE)
  @Audited('encounter.start', 'Encounter')
  async start(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.start(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/document')
  @RequirePermission(PERMISSION_KEYS.ENCOUNTER_CREATE)
  @Audited('encounter.document', 'Encounter')
  async document(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.document(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/sign')
  @RequirePermission(PERMISSION_KEYS.ENCOUNTER_SIGN)
  @Audited('encounter.sign', 'Encounter')
  async sign(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.sign(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/send-to-coding')
  @RequirePermission(PERMISSION_KEYS.ENCOUNTER_CREATE)
  @Audited('encounter.send_to_coding', 'Encounter')
  async sendToCoding(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.sendToCoding(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
