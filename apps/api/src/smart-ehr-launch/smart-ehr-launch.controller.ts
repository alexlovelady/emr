import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCurrentTransaction } from '@ehr/db';
import { ForbiddenError, NotFoundError, ValidationError, type RequestContext } from '@ehr/domain-common';
import { Audited } from '@ehr/audit';
import { PERMISSION_KEYS, RequirePermission } from '@ehr/authz';
import type { Env } from '@ehr/config';
import { PatientRepository } from '@ehr/patient';
import { EncounterRepository } from '@ehr/clinical';
import { ZodValidationPipe } from '@ehr/api-contracts';
import { ENV_CONFIG } from '../common/tokens.js';
import { SmartLaunchCreateSchema, type SmartLaunchCreateInput } from './smart-ehr-launch.dto.js';

const LAUNCH_CONTEXT_TTL_MS = 5 * 60 * 1000;

export interface LaunchableSmartClient {
  id: string;
  clientId: string;
  displayName: string;
  launchUri: string;
}

/**
 * Item 24: the originating half of SMART EHR launch — the other half of
 * `AuthorizeController`'s `launch`-param branch in `apps/interop-fhir`. Gated on
 * `PATIENT_READ_CLINICAL` (not a new permission): handing a registered app the same patient
 * context a clinician already has legitimate read access to doesn't grant anything new, it just
 * changes which surface presents it — the same reasoning `POST /practitioners/names` used for a
 * non-admin-tier lookup.
 */
@Controller('api/v1')
export class SmartEhrLaunchController {
  private readonly patientRepo = new PatientRepository();
  private readonly encounterRepo = new EncounterRepository();

  constructor(@Inject(ENV_CONFIG) private readonly env: Env) {}

  /** Only clients an admin has registered a `launch_uri` for are EHR-launchable — everything else
   * (including every client seeded before item 24) simply doesn't appear here. */
  @Get('smart-clients')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('smart_client.list', 'SmartClient')
  async listLaunchable(@Req() req: FastifyRequest): Promise<LaunchableSmartClient[]> {
    const ctx = requireCtx(req);
    const rows = await getCurrentTransaction()
      .selectFrom('smart_clients')
      .select(['id', 'client_id', 'display_name', 'launch_uri'])
      .where('tenant_id', '=', ctx.tenantId)
      .where('status', '=', 'active')
      .where('launch_uri', 'is not', null)
      .execute();
    return rows.map((r) => ({ id: r.id, clientId: r.client_id, displayName: r.display_name, launchUri: r.launch_uri! }));
  }

  @Post('patients/:patientId/smart-launch')
  @RequirePermission(PERMISSION_KEYS.PATIENT_READ_CLINICAL)
  @Audited('smart_client.launch', 'SmartLaunchContext')
  async launch(
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(SmartLaunchCreateSchema)) body: SmartLaunchCreateInput,
    @Req() req: FastifyRequest,
  ): Promise<{ launchUrl: string }> {
    const ctx = requireCtx(req);
    if (!ctx.actor) throw new ForbiddenError('No authenticated actor on request');
    const trx = getCurrentTransaction();

    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const client = await trx
      .selectFrom('smart_clients')
      .select(['client_id', 'launch_uri'])
      .where('tenant_id', '=', ctx.tenantId)
      .where('client_id', '=', body.clientId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!client) throw new NotFoundError('SMART client not found', { clientId: body.clientId });
    if (!client.launch_uri) throw new ValidationError('This client is not registered for EHR launch', { clientId: body.clientId });

    let encounterId: string | null = null;
    if (body.encounterId) {
      const encounter = await this.encounterRepo.findById(trx, ctx.tenantId, body.encounterId);
      if (!encounter || encounter.patientId !== patientId) {
        throw new NotFoundError('Encounter not found for this patient', { encounterId: body.encounterId });
      }
      encounterId = encounter.id;
    }

    const context = await trx
      .insertInto('smart_launch_contexts')
      .values({
        tenant_id: ctx.tenantId,
        client_id: client.client_id,
        patient_id: patientId,
        encounter_id: encounterId,
        user_id: ctx.actor.id,
        expires_at: new Date(Date.now() + LAUNCH_CONTEXT_TTL_MS),
        status: 'active',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const launchUrl = new URL(client.launch_uri);
    launchUrl.searchParams.set('iss', this.fhirBaseUrl());
    launchUrl.searchParams.set('launch', context.id);
    return { launchUrl: launchUrl.toString() };
  }

  private fhirBaseUrl(): string {
    return `http://localhost:${this.env.INTEROP_FHIR_PORT}/fhir/r4`;
  }
}

function requireCtx(req: FastifyRequest): RequestContext {
  if (!req.ehrContext) throw new ForbiddenError('No authenticated actor on request');
  return req.ehrContext;
}
