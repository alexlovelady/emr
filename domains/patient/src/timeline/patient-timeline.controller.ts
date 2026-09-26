import { Controller, Get, Param, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import { PatientTimelineService } from './patient-timeline.service.js';

@Controller('api/v1/patients/:id/timeline')
export class PatientTimelineController {
  constructor(private readonly service: PatientTimelineService) {}

  @Get()
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_DEMOGRAPHICS)
  @Audited('patient.timeline.read', 'Patient')
  async getTimeline(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.service.getTimeline(getCurrentTransaction(), requireCtx(req), id);
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
