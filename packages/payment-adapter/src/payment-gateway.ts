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

/**
 * EHR_BUILD_SPEC.md §13.1 names "EFT/payment rails" and "card processing" as explicit **buy**
 * items (Phase 6), never built there since no real caller needed it yet. Phase 8's patient bill-pay
 * is that real caller. No real card processor exists to integrate against — same adapter-
 * interface-now pattern as every other vendor boundary (lab, eRx, clearinghouse). A
 * `paymentMethodToken` (never a raw card number) is the only card-like input this interface ever
 * accepts — tokenization happens client-side against the real processor's own SDK, which this repo
 * has no client/frontend to host yet (see README's Phase 8 scope decisions).
 */
export interface PaymentGateway {
  chargeCard(request: ChargeCardRequest): Promise<ChargeCardResult>;
}
