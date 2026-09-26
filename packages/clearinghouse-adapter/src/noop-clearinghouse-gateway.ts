import { randomUUID } from 'node:crypto';
import type {
  ClaimSubmission,
  ClaimSubmissionReceipt,
  ClearinghouseClaimStatus,
  ClearinghouseGateway,
  EligibilityCheckRequest,
  EligibilityCheckResult,
} from './clearinghouse-gateway.js';

/**
 * No real clearinghouse vendor exists in this environment. `submitClaim` resolves synchronously
 * with a generated transaction id — a real submission is async (277CA/835 arrive later via
 * apps/webhook-gateway); this stub short-circuits that, the same simplification stance as
 * `NoopLabOrderGateway`/`NoopPrescribingGateway`.
 */
export class NoopClearinghouseGateway implements ClearinghouseGateway {
  async checkEligibility(_request: EligibilityCheckRequest): Promise<EligibilityCheckResult> {
    return { isEligible: true, copayAmount: 25, deductibleRemaining: 500 };
  }

  async submitClaim(_submission: ClaimSubmission): Promise<ClaimSubmissionReceipt> {
    return { clearinghouseTransactionId: `noop-claim-${randomUUID()}`, submittedAt: new Date() };
  }

  async checkClaimStatus(_clearinghouseTransactionId: string): Promise<ClearinghouseClaimStatus> {
    return 'unknown';
  }
}
