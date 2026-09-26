import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { PatientService, UpdatePatientContactSchema, type UpdatePatientContactInput } from '@ehr/patient';
import { ConsentService } from '@ehr/consent';

@Controller('api/v1/portal/patients/:patientId/profile')
@SkipAuthz()
export class PortalProfileController {
  private readonly patientService = new PatientService();
  private readonly consentService = new ConsentService();

  @Get()
  @Audited('portal_profile.read', 'Patient')
  async get(@Param('patientId') patientId: string, @Req() req: FastifyRequest) {
    const ctx = requirePortalCtx(req);
    await this.consentService.assertAccess(getCurrentTransaction(), ctx.tenantId, ctx.actor.id, patientId);
    return this.patientService.getById(getCurrentTransaction(), ctx, patientId);
  }

  @Patch()
  @Audited('portal_profile.update', 'Patient')
  async update(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(UpdatePatientContactSchema)) body: UpdatePatientContactInput,
    @Req() req: FastifyRequest,
  ) {
    const ctx = requirePortalCtx(req);
    await this.consentService.assertAccess(getCurrentTransaction(), ctx.tenantId, ctx.actor.id, patientId);
    return this.patientService.updateContactInfo(getCurrentTransaction(), ctx, patientId, body);
  }
}

type PortalRequestContext = RequestContext & { actor: { id: string; type: 'patient' } };

function requirePortalCtx(req: FastifyRequest): PortalRequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext as PortalRequestContext;
}
