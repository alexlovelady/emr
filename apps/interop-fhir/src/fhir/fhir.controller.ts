import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { FastifyRequest } from 'fastify';
import { withTenantContext, type DB } from '@ehr/db';
import { NotFoundError, ValidationError } from '@ehr/domain-common';
import type { Env } from '@ehr/config';
import { PatientRepository } from '@ehr/patient';
import { EncounterRepository, ObservationRepository, ProblemRepository, AllergyRepository } from '@ehr/clinical';
import { PrescriptionRepository, MedicationRepository } from '@ehr/medication';
import { DocumentRepository } from '@ehr/documents';
import {
  toFhirPatient,
  toFhirObservation,
  toFhirEncounter,
  toFhirCondition,
  toFhirAllergyIntolerance,
  toFhirMedicationRequest,
  toFhirDocumentReference,
  buildCapabilityStatement,
} from '@ehr/fhir-mapping';
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
  private readonly problemRepo = new ProblemRepository();
  private readonly allergyRepo = new AllergyRepository();
  private readonly prescriptionRepo = new PrescriptionRepository();
  private readonly medicationRepo = new MedicationRepository();
  private readonly documentRepo = new DocumentRepository();

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Kysely<DB>,
    @Inject(ENV_CONFIG) private readonly env: Env,
  ) {}

  @Get('metadata')
  metadata(): Record<string, unknown> {
    return buildCapabilityStatement(this.fhirBaseUrl());
  }

  /**
   * SMART App Launch's discovery document, published relative to the FHIR base URL per spec.
   * `authorization_endpoint` is intentionally omitted — no interactive authorize/launch flow is
   * implemented yet (client-credentials only); update this alongside whichever controller adds it.
   */
  @Get('.well-known/smart-configuration')
  smartConfiguration(): Record<string, unknown> {
    const baseUrl = this.fhirBaseUrl();
    return {
      issuer: baseUrl,
      token_endpoint: `${baseUrl}/token`,
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      grant_types_supported: ['client_credentials'],
      scopes_supported: [
        'patient/Patient.read',
        'patient/Observation.read',
        'patient/Encounter.read',
        'patient/Condition.read',
        'patient/AllergyIntolerance.read',
        'patient/MedicationRequest.read',
        'patient/DocumentReference.read',
        'system/*.read',
      ],
      response_types_supported: [],
      capabilities: ['client-confidential-symmetric', 'permission-v2'],
    };
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

  @Get('Condition/:id')
  @RequireScope('patient/Condition.read')
  async getCondition(@Param('id') id: string, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    const row = await withTenantContext(this.db, ctx.tenantId, (trx) => this.problemRepo.findById(trx, ctx.tenantId, id));
    if (!row) throw new NotFoundError('Condition not found', { id });
    return toFhirCondition(row);
  }

  @Get('Condition')
  @RequireScope('patient/Condition.read')
  async searchConditions(@Query('patient') patientId: string | undefined, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const rows = await withTenantContext(this.db, ctx.tenantId, (trx) => this.problemRepo.listByPatient(trx, ctx.tenantId, patientId));
    return toSearchBundle(rows.map(toFhirCondition));
  }

  @Get('AllergyIntolerance/:id')
  @RequireScope('patient/AllergyIntolerance.read')
  async getAllergyIntolerance(@Param('id') id: string, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    const row = await withTenantContext(this.db, ctx.tenantId, (trx) => this.allergyRepo.findById(trx, ctx.tenantId, id));
    if (!row) throw new NotFoundError('AllergyIntolerance not found', { id });
    return toFhirAllergyIntolerance(row);
  }

  @Get('AllergyIntolerance')
  @RequireScope('patient/AllergyIntolerance.read')
  async searchAllergyIntolerances(@Query('patient') patientId: string | undefined, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const rows = await withTenantContext(this.db, ctx.tenantId, (trx) => this.allergyRepo.listByPatient(trx, ctx.tenantId, patientId));
    return toSearchBundle(rows.map(toFhirAllergyIntolerance));
  }

  @Get('MedicationRequest/:id')
  @RequireScope('patient/MedicationRequest.read')
  async getMedicationRequest(@Param('id') id: string, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    const prescription = await withTenantContext(this.db, ctx.tenantId, (trx) => this.prescriptionRepo.findById(trx, ctx.tenantId, id));
    if (!prescription) throw new NotFoundError('MedicationRequest not found', { id });
    const medication = await withTenantContext(this.db, ctx.tenantId, (trx) =>
      this.medicationRepo.findById(trx, ctx.tenantId, prescription.medicationId),
    );
    if (!medication) throw new NotFoundError('Medication not found', { id: prescription.medicationId });
    return toFhirMedicationRequest(prescription, medication);
  }

  @Get('MedicationRequest')
  @RequireScope('patient/MedicationRequest.read')
  async searchMedicationRequests(@Query('patient') patientId: string | undefined, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const prescriptions = await withTenantContext(this.db, ctx.tenantId, (trx) => this.prescriptionRepo.listByPatient(trx, ctx.tenantId, patientId));
    const resources = await Promise.all(
      prescriptions.map(async (prescription) => {
        const medication = await withTenantContext(this.db, ctx.tenantId, (trx) =>
          this.medicationRepo.findById(trx, ctx.tenantId, prescription.medicationId),
        );
        return medication ? toFhirMedicationRequest(prescription, medication) : null;
      }),
    );
    return toSearchBundle(resources.filter((r): r is Record<string, unknown> => r !== null));
  }

  @Get('DocumentReference/:id')
  @RequireScope('patient/DocumentReference.read')
  async getDocumentReference(@Param('id') id: string, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    const row = await withTenantContext(this.db, ctx.tenantId, (trx) => this.documentRepo.findById(trx, ctx.tenantId, id));
    if (!row) throw new NotFoundError('DocumentReference not found', { id });
    return toFhirDocumentReference(row, `${this.fhirBaseUrl()}/DocumentReference`);
  }

  @Get('DocumentReference')
  @RequireScope('patient/DocumentReference.read')
  async searchDocumentReferences(@Query('patient') patientId: string | undefined, @Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const ctx = requireFhirCtx(req);
    if (!patientId) throw new ValidationError('The `patient` search parameter is required');
    const rows = await withTenantContext(this.db, ctx.tenantId, (trx) => this.documentRepo.list(trx, ctx.tenantId, { patientId }));
    const documentReferenceUrl = `${this.fhirBaseUrl()}/DocumentReference`;
    return toSearchBundle(rows.map((row) => toFhirDocumentReference(row, documentReferenceUrl)));
  }

  private fhirBaseUrl(): string {
    return `http://localhost:${this.env.INTEROP_FHIR_PORT}/fhir/r4`;
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
