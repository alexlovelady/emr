import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { RequestContext } from '@ehr/domain-common';
import { ClaimService, type ClaimTimeline } from '@ehr/claims';
import { RemittanceService } from '../remittance/remittance.service.js';
import type { RemittanceRow } from '../remittance/remittance.repository.js';

type Executor = Kysely<DB> | Transaction<DB>;

export interface FullClaimTimeline extends ClaimTimeline {
  remittances: RemittanceRow[];
}

/**
 * Composes across `@ehr/claims` (claim + versions + denials) and this package's own Remittances
 * into the single linked view spec §11.1 asks for. Lives in `@ehr/payments`, not `@ehr/claims`,
 * because `@ehr/payments` already depends on `@ehr/claims` to update claim status — the reverse
 * dependency would be circular. Same "the timeline lives in the downstream-consuming domain"
 * pattern already used by Phase 2's `PatientTimelineService` (which pulls from
 * `@ehr/scheduling`/`@ehr/tasks` rather than either of those owning a patient-timeline endpoint).
 */
export class ClaimTimelineService {
  constructor(
    private readonly claimService: ClaimService,
    private readonly remittanceService: RemittanceService,
  ) {}

  async getTimeline(trx: Executor, ctx: RequestContext, claimId: string): Promise<FullClaimTimeline> {
    const base = await this.claimService.timeline(trx, ctx, claimId);
    const remittances = await this.remittanceService.listByClaim(trx, ctx, claimId);
    return { ...base, remittances };
  }
}
