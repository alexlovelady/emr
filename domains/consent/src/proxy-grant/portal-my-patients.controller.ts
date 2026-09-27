import { Controller, Get, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { SkipAuthz } from '@ehr/authz';
import { PatientRepository, type PatientRow } from '@ehr/patient';
import { ConsentService } from './proxy-grant.service.js';

export interface PortalAccessiblePatient {
  patientId: string;
  relationshipType: string;
  patient: PatientRow;
}

/**
 * A portal account's login/register response carries no patientId (apps/api/src/portal-auth) — this
 * is the only way a patient-portal frontend can discover which patient(s) it may access before
 * calling any /portal/patients/:patientId/... route. Built for Phase F's frontend, not part of the
 * original portal backend pass.
 */
@Controller('api/v1/portal/patients')
@SkipAuthz()
export class PortalMyPatientsController {
  private readonly consentService = new ConsentService();
  private readonly patientRepo = new PatientRepository();

  @Get()
  @Audited('portal_my_patients.list', 'Patient')
  async list(@Req() req: FastifyRequest): Promise<PortalAccessiblePatient[]> {
    const ctx = requirePortalCtx(req);
    const trx = getCurrentTransaction();
    const grants = await this.consentService.listActiveByPortalAccount(trx, ctx.tenantId, ctx.actor.id);
    const patients = await Promise.all(
      grants.map(async (grant): Promise<PortalAccessiblePatient | null> => {
        const patient = await this.patientRepo.findById(trx, ctx.tenantId, grant.patientId);
        return patient ? { patientId: grant.patientId, relationshipType: grant.relationshipType, patient } : null;
      }),
    );
    return patients.filter((p): p is PortalAccessiblePatient => p !== null);
  }
}

type PortalRequestContext = RequestContext & { actor: { id: string; type: 'patient' } };

function requirePortalCtx(req: FastifyRequest): PortalRequestContext {
  if (!req.ehrContext?.actor || req.ehrContext.actor.type !== 'patient') {
    throw new ForbiddenError('No authenticated portal actor on request');
  }
  return req.ehrContext as PortalRequestContext;
}
