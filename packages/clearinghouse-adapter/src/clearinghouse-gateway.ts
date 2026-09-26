export interface EligibilityCheckRequest {
  payerName: string;
  memberId: string;
  patientName: string;
}

export interface EligibilityCheckResult {
  isEligible: boolean;
  copayAmount: number | null;
  deductibleRemaining: number | null;
}

export interface ClaimSubmissionCharge {
  code: string;
  units: number;
  unitPrice: number;
  diagnosisCodes: string[];
}

export interface ClaimSubmission {
  claimId: string;
  totalChargeAmount: number;
  payerName: string | null;
  memberId: string | null;
  charges: ClaimSubmissionCharge[];
}

export interface ClaimSubmissionReceipt {
  clearinghouseTransactionId: string;
  submittedAt: Date;
}

export type ClearinghouseClaimStatus = 'submitted' | 'accepted' | 'rejected' | 'adjudicated' | 'unknown';

/**
 * EHR_BUILD_SPEC.md §13.1's "Build vs buy": payer network/clearinghouse connectivity, eligibility
 * routing, and X12 transport are explicit **buy** items, not build items — a practical candidate
 * (Stedi) supports JSON/X12 for 270/271 eligibility, 837 claims, 277CA, 276/277 status, and 835
 * ERAs. No real X12 vendor exists to integrate against yet — same adapter-interface-now pattern as
 * ADR-0002 and Phase 4/5's lab/eRx adapters. `NoopClearinghouseGateway` is the only implementation;
 * a real one plugs in later without touching `domains/claims`/`domains/payments`' call sites.
 */
export interface ClearinghouseGateway {
  checkEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResult>;
  submitClaim(submission: ClaimSubmission): Promise<ClaimSubmissionReceipt>;
  checkClaimStatus(clearinghouseTransactionId: string): Promise<ClearinghouseClaimStatus>;
}
