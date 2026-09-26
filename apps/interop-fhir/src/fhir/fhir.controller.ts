import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { FastifyRequest } from 'fastify';
import { withTenantContext, type DB } from '@ehr/db';
import { NotFoundError, ValidationError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import { PatientRepository } from '@ehr/patient';
import { EncounterRepository, ObservationRepository } from '@ehr/clinical';
import { toFhirPatient, toFhirObservation, toFhirEncounter, buildCapabilityStatement } from '@ehr/fhir-mapping';
import { DB_CONNECTION, ENV_CONFIG } from '../common/tokens.js';
import { RequireScope } from '../common/require-scope.decorator.js';
import { requireFhirCtx } from './require-fhir-context.js';

/**
 * EHR_BUILD_SPEC.md §8.1 Lane A. Deliberately just the four endpoints the spec lists
 * (`metadata`, `Patient/{id}`, `Observation` search, `Encounter` search) — `$everything` and
 * `Group/$export` (bulk async) are documented Phase 4 gaps, not silently skipped: both need a job
 * queue this repo doesn't have yet.
 */
@Controller('fhir/r4')
export class FhirController {
  private readonly patientRepo = new PatientRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly encounterRepo = new EncounterRepository();

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  @Get('metadata')
  metadata(): Record<string, unknown> {
    return buildCapabilityStatement(`http://localhost:${this.env.INTEROP_FHIR_PORT}/fhir/r4`);
  }

  @Get('Patient/:id')
  @RequireScope('patient/Patient.read')
  async getPatient(@Param('id') id: string, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    const row = await withTenantContext(this.db, ctx.tenantId, (trx) => this.patientRepo.findById(trx, ctx.tenantId, id));
    if (!row) throw new NotFoundError('Patient not found', { id });
    return toFhirPatient(row);
  }

  @Get('Observation')
  @RequireScope('patient/Observation.read')
  async searchObservations(
    @Query('patient') patientId: string | undefined,
    @Query('category') category: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const rows = await withTenantContext(this.db, ctx.tenantId, (trx) =>
      this.observationRepo.listByPatient(trx, ctx.tenantId, patientId, category ? { category } : {}),
    );
    return toSearchBundle(rows.map(toFhirObservation));
  }

  @Get('Encounter')
  @RequireScope('patient/Encounter.read')
  async searchEncounters(@Query('patient') patientId: string | undefined, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const rows = await withTenantContext(this.db, ctx.tenantId, (trx) => this.encounterRepo.list(trx, ctx.tenantId, { patientId }));
    return toSearchBundle(rows.map(toFhirEncounter));
  }
}

function toSearchBundle(resources: Record<string, unknown>[]): Record<string, unknown> {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((resource) => ({ resource })),
  };
}
