import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { PatientRepository } from '@ehr/patient';
import { PractitionerRepository } from '@ehr/workforce';
import { ReferralRepository, type ReferralRow } from './referral.repository.js';
import type { CreateReferralInput, UpdateReferralStatusInput } from './referral.dto.js';

type Executor = Kysely<DB> | Transaction<DB>;

const TRANSITIONS: Record<string, { from: string[] }> = {
  sent: { from: ['pending'] },
  scheduled: { from: ['sent'] },
  completed: { from: ['scheduled'] },
  declined: { from: ['sent'] },
  cancelled: { from: ['pending', 'sent', 'scheduled'] },
};

/**
 * Tier 2 platform gap: tracking a referral to a specialist and closing the loop — confirmed to not
 * exist anywhere in this codebase before this. `pending -> sent -> scheduled -> completed` is the
 * normal path; `declined` only reachable from `sent` (the specialist's office says no before ever
 * scheduling); `cancelled` reachable from any non-terminal state (the referring practitioner changed
 * their mind). No further transition exists once `completed`/`declined`/`cancelled`.
 */
export class ReferralService {
  constructor(
    private readonly repo: ReferralRepository = new ReferralRepository(),
    private readonly patientRepo: PatientRepository = new PatientRepository(),
    private readonly practitionerRepo: PractitionerRepository = new PractitionerRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, patientId: string, input: CreateReferralInput): Promise<ReferralRow> {
    const patient = await this.patientRepo.findById(trx, ctx.tenantId, patientId);
    if (!patient) throw new NotFoundError('Patient not found', { patientId });

    const referringPractitioner = await this.practitionerRepo.findById(trx, ctx.tenantId, input.referringPractitionerId);
    if (!referringPractitioner) throw new NotFoundError('Referring practitioner not found', { practitionerId: input.referringPractitionerId });

    if (input.referredToPractitionerId) {
      const referredTo = await this.practitionerRepo.findById(trx, ctx.tenantId, input.referredToPractitionerId);
      if (!referredTo) throw new NotFoundError('Referred-to practitioner not found', { practitionerId: input.referredToPractitionerId });
    }

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      patientId,
      referringPractitionerId: input.referringPractitionerId,
      referredToPractitionerId: input.referredToPractitionerId ?? null,
      externalProviderName: input.externalProviderName ?? null,
      specialty: input.specialty,
      reason: input.reason,
      urgency: input.urgency,
      createdBy: actorId,
    });
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<ReferralRow> {
    const referral = await this.repo.findById(trx, ctx.tenantId, id);
    if (!referral) throw new NotFoundError('Referral not found', { id });
    return referral;
  }

  async listByPatient(trx: Executor, ctx: RequestContext, patientId: string): Promise<ReferralRow[]> {
    return this.repo.listByPatient(trx, ctx.tenantId, patientId);
  }

  async updateStatus(trx: Executor, ctx: RequestContext, id: string, input: UpdateReferralStatusInput): Promise<ReferralRow> {
    const current = await this.getById(trx, ctx, id);
    this.assertTransition(current.status, input.status);
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.updateStatus(trx, ctx.tenantId, id, input.status, input.notes ?? null, actorId);
  }

  private assertTransition(currentStatus: string, targetStatus: string): void {
    const rule = TRANSITIONS[targetStatus];
    if (!rule || !rule.from.includes(currentStatus)) {
      throw new ConflictError(`Cannot transition referral from '${currentStatus}' to '${targetStatus}'`, { currentStatus, targetStatus });
    }
  }
}
