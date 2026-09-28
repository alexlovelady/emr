import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository, CoverageRepository } from '@ehr/patient';
import { PractitionerRepository } from '@ehr/workforce';
import { PriorAuthorizationRepository, type PriorAuthorizationRow } from './prior-auth.repository.js';
import type { CreatePriorAuthorizationInput, RecordPriorAuthDecisionInput } from './prior-auth.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

const CANCELLABLE_FROM = ['pending', 'approved'];

/**
 * Prior authorization tracking (Tier 2 platform gap) — the insurance kind, request/approve/deny
 * before a procedure. No live payer prior-auth API exists to integrate against (same buy-not-built
 * boundary as clearinghouse/eligibility) — `recordDecision` logs what staff learned through
 * whatever channel the payer actually uses, it never transmits a request itself. No scheduler
 * exists anywhere in this codebase to auto-expire an approved authorization past `validUntil` — an
 * explicit `expire()` call is the only way, matching the "no async job queue" honesty already
 * established for payment plans.
 */
export class PriorAuthorizationService {
  constructor(
    private readonly repo: PriorAuthorizationRepository = new PriorAuthorizationRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly coverageRepo: CoverageRepository = new CoverageRepository(),
    private readonly practitionerRepo: PractitionerRepository = new PractitionerRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreatePriorAuthorizationInput): Promise<PriorAuthorizationRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const coverage = await this.coverageRepo.findById(trx, ctx.tenantId, input.coverageId);
    if (!coverage || coverage.patientId !== patientId) throw new NotFoundError('Coverage not found', { coverageId: input.coverageId });

    const practitioner = await this.practitionerRepo.findById(trx, ctx.tenantId, input.requestedByPractitionerId);
    if (!practitioner) throw new NotFoundError('Practitioner not found', { practitionerId: input.requestedByPractitionerId });

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      coverageId: input.coverageId,
      requestedByPractitionerId: input.requestedByPractitionerId,
      procedureCode: input.procedureCode,
      procedureDescription: input.procedureDescription,
      diagnosisCode: input.diagnosisCode,
      notes: input.notes ?? null,
      createdBy: actorId,
    });
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<PriorAuthorizationRow> {
    const auth = await this.repo.findById(trx, ctx.tenantId, id);
    if (!auth) throw new NotFoundError('Prior authorization not found', { id });
    return auth;
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<PriorAuthorizationRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async recordDecision(trx: Executor, ctx: RequestContext, id: string, input: RecordPriorAuthDecisionInput): Promise<PriorAuthorizationRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'pending') {
      throw new ConflictError(`Cannot record a decision on a prior authorization that is ${current.status}`, { id, status: current.status });
    }
    if (input.decision === 'approved' && !input.validUntil) {
      throw new ConflictError('An approval requires a validUntil date', { id });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.recordDecision(
      trx,
      ctx.tenantId,
      id,
      {
        status: input.decision,
        payerReferenceNumber: input.payerReferenceNumber ?? null,
        validFrom: input.decision === 'approved' ? (input.validFrom ?? null) : null,
        validUntil: input.decision === 'approved' ? (input.validUntil ?? null) : null,
        denialReason: input.decision === 'denied' ? (input.denialReason ?? null) : null,
      },
      actorId,
    );
  }

  async expire(trx: Executor, ctx: RequestContext, id: string): Promise<PriorAuthorizationRow> {
    const current = await this.getById(trx, ctx, id);
    if (current.status !== 'approved') {
      throw new ConflictError(`Cannot expire a prior authorization that is ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.updateStatus(trx, ctx.tenantId, id, 'expired', null, actorId);
  }

  async cancel(trx: Executor, ctx: RequestContext, id: string, notes: string | null): Promise<PriorAuthorizationRow> {
    const current = await this.getById(trx, ctx, id);
    if (!CANCELLABLE_FROM.includes(current.status)) {
      throw new ConflictError(`Cannot cancel a prior authorization that is ${current.status}`, { id, status: current.status });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.updateStatus(trx, ctx.tenantId, id, 'cancelled', notes, actorId);
  }
}
