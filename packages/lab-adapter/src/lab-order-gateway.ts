export interface LabOrderSubmission {
  orderId: string;
  orderType: string;
  codeSystem: string | null;
  code: string | null;
  displayName: string;
  priority: string;
}

export interface LabOrderSubmissionResult {
  /** The identifier the lab expects to see echoed back on the eventual result message (HL7 OBR-2). */
  placerOrderNumber: string;
  transmittedAt: Date;
}

export type LabOrderStatus = 'submitted' | 'in_progress' | 'completed' | 'unknown';

/**
 * EHR_BUILD_SPEC.md §26 Phase 4's "lab adapter framework": an adapter interface only — no real
 * lab vendor exists to integrate against yet (same pattern as ADR-0002's IdentityProvider/
 * ObjectStorageGateway). `NoopLabOrderGateway` is the only implementation; a real one plugs in
 * later without touching `domains/orders`' call sites.
 */
export interface LabOrderGateway {
  submitOrder(order: LabOrderSubmission): Promise<LabOrderSubmissionResult>;
  checkStatus(placerOrderNumber: string): Promise<LabOrderStatus>;
}
