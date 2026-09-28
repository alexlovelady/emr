export interface ChargeCardRequest {
  patientId: string;
  amountCents: number;
  currency: string;
  paymentMethodToken: string;
}

export interface ChargeCardResult {
  transactionId: string;
  status: 'succeeded' | 'failed';
  failureReason: string | null;
}

export interface ChargeAchRequest {
  patientId: string;
  amountCents: number;
  currency: string;
  bankAccountToken: string;
}

export interface ChargeAchResult {
  transactionId: string;
  status: 'succeeded' | 'pending' | 'failed';
  failureReason: string | null;
}

/**
 * EHR_BUILD_SPEC.md §13.1 names "EFT/payment rails" and "card processing" as explicit **buy**
 * items (Phase 6), never built there since no real caller needed it yet. Phase 8's patient bill-pay
 * is that real caller. No real card processor exists to integrate against — same adapter-
 * interface-now pattern as every other vendor boundary (lab, eRx, clearinghouse). A
 * `paymentMethodToken`/`bankAccountToken` (never a raw card or account/routing number) is the only
 * card/bank-like input this interface ever accepts — tokenization happens client-side against the
 * real processor's own SDK, which this repo has no client/frontend to host yet (see README's
 * Phase 8 scope decisions).
 *
 * `chargeAch` exists alongside `chargeCard` (rather than a single generic `charge()`) because a
 * real ACH debit is genuinely asynchronous — it can legitimately settle as `'pending'` for days
 * before succeeding or failing, a state card payments don't have. Cash/check payments never call
 * this gateway at all: they're recorded directly by staff via `domains/payments`'s `PaymentService`
 * as an already-completed real-world event, with no processor in the loop to call.
 */
export interface PaymentGateway {
  chargeCard(request: ChargeCardRequest): Promise<ChargeCardResult>;
  chargeAch(request: ChargeAchRequest): Promise<ChargeAchResult>;
}
