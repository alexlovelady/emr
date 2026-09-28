import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import { ConflictError, NotFoundError, type RequestContext } from '@ehr/domain-common';
import { AppealRepository, type AppealRow } from './appeal.repository.js';
import type { CreateAppealInput, DecideAppealInput } from './appeal.dto.js';
import { DenialRepository } from '../denial/denial.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

const ACTIVE_APPEAL_STATUSES = ['draft', 'submitted'];

/**
 * Real appeal tracking (Athelas RCM parity item 4) — `DenialService.resolve()` alone was pure
 * bookkeeping with no concept of "we appealed this." An appeal has its own lifecycle independent
 * of the denial's `open`/`appealed`/`resolved` status: submitting an appeal moves the denial to
 * `appealed` (blocking a direct `resolve()` call while it's in flight, via that service's existing
 * `status !== 'open'` guard — no change needed there); deciding it moves the denial to `resolved`
 * (won) or back to `open` (lost, so it can still be worked).
 */
export class AppealService {
  constructor(
    private readonly repo: AppealRepository = new AppealRepository(),
    private readonly denialRepo: DenialRepository = new DenialRepository(),
  ) {}

  async create(trx: Executor, ctx: RequestContext, denialId: string, input: CreateAppealInput): Promise<AppealRow> {
    const denial = await this.denialRepo.findById(trx, ctx.tenantId, denialId);
    if (!denial) throw new NotFoundError('Denial not found', { denialId });
    if (denial.status !== 'open') {
      throw new ConflictError(`Cannot appeal a denial that is ${denial.status}`, { denialId, status: denial.status });
    }

    const existing = await this.repo.listByDenial(trx, ctx.tenantId, denialId);
    if (existing.some((a) => ACTIVE_APPEAL_STATUSES.includes(a.status))) {
      throw new ConflictError('This denial already has an active appeal', { denialId });
    }

    const actorId = ctx.actor?.id ?? ctx.tenantId;
    return this.repo.create(trx, {
      tenantId: ctx.tenantId,
      claimId: denial.claimId,
      denialId,
      appealReason: input.appealReason,
      sourceAiGenerationId: input.sourceAiGenerationId ?? null,
      createdBy: actorId,
    });
  }

  async getById(trx: Executor, ctx: RequestContext, id: string): Promise<AppealRow> {
    const appeal = await this.repo.findById(trx, ctx.tenantId, id);
    if (!appeal) throw new NotFoundError('Appeal not found', { id });
    return appeal;
  }

  async listByDenial(trx: Executor, ctx: RequestContext, denialId: string): Promise<AppealRow[]> {
    return this.repo.listByDenial(trx, ctx.tenantId, denialId);
  }

  async submit(trx: Executor, ctx: RequestContext, id: string): Promise<AppealRow> {
    const appeal = await this.getById(trx, ctx, id);
    if (appeal.status !== 'draft') {
      throw new ConflictError(`Appeal cannot be submitted from status '${appeal.status}'`, { id, status: appeal.status });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const submitted = await this.repo.markSubmitted(trx, ctx.tenantId, id, actorId);
    await this.denialRepo.updateStatus(trx, ctx.tenantId, appeal.denialId, 'appealed', actorId);
    return submitted;
  }

  async decide(trx: Executor, ctx: RequestContext, id: string, input: DecideAppealInput): Promise<AppealRow> {
    const appeal = await this.getById(trx, ctx, id);
    if (appeal.status !== 'submitted') {
      throw new ConflictError(`Appeal cannot be decided from status '${appeal.status}'`, { id, status: appeal.status });
    }
    const actorId = ctx.actor?.id ?? ctx.tenantId;
    const decided = await this.repo.decide(trx, ctx.tenantId, id, input.outcome, input.decisionNotes, actorId);

    if (input.outcome === 'won') {
      await this.denialRepo.resolve(trx, ctx.tenantId, appeal.denialId, `Appeal won: ${input.decisionNotes}`, actorId);
    } else {
      await this.denialRepo.updateStatus(trx, ctx.tenantId, appeal.denialId, 'open', actorId);
    }

    return decided;
  }
}
