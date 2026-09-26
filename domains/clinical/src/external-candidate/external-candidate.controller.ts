import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import {
  ImportExternalCandidatesSchema,
  ReplaceExternalCandidateSchema,
  type ImportExternalCandidatesInput,
  type ReplaceExternalCandidateInput,
} from './external-candidate.dto.js';
import { ExternalCandidateService } from './external-candidate.service.js';

@Controller('api/v1/patients/:patientId/external-candidates')
export class ExternalCandidateController {
  constructor(private readonly service: ExternalCandidateService) {}

  @Post('import')
  @RequirePermission(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE)
  @Audited('external_candidate.import', 'ExternalCandidate')
  async import(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(ImportExternalCandidatesSchema)) body: ImportExternalCandidatesInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.import(getCurrentTransaction(), requireCtx(req), patientId, body);
  }

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('external_candidate.list', 'ExternalCandidate')
  async list(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    return this.service.list(getCurrentTransaction(), requireCtx(req), patientId);
  }
}

@Controller('api/v1/external-candidates')
export class ExternalCandidateDetailController {
  constructor(private readonly service: ExternalCandidateService) {}

  @Get(':id')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('external_candidate.read', 'ExternalCandidate')
  async getById(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getById(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/accept')
  @RequirePermission(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE)
  @Audited('external_candidate.accept', 'ExternalCandidate')
  async accept(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.accept(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE)
  @Audited('external_candidate.reject', 'ExternalCandidate')
  async reject(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.reject(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/mark-duplicate')
  @RequirePermission(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE)
  @Audited('external_candidate.mark_duplicate', 'ExternalCandidate')
  async markDuplicate(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.markDuplicate(getCurrentTransaction(), requireCtx(req), id);
  }

  @Post(':id/replace')
  @RequirePermission(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE)
  @Audited('external_candidate.replace', 'ExternalCandidate')
  async replace(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReplaceExternalCandidateSchema)) body: ReplaceExternalCandidateInput,
    @Req() req: FastifyRequest,
  ) {
    return this.service.replace(getCurrentTransaction(), requireCtx(req), id, body.targetResourceId);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
