export interface MedicationConcept {
  code: string;
  display: string;
  codeSystem: string;
}

export interface Pharmacy {
  ncpdpId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

export interface FormularyInfo {
  medicationCode: string;
  covered: boolean;
  tier: number | null;
  priorAuthRequired: boolean;
  notes: string | null;
}

export interface PrescriptionSubmission {
  prescriptionId: string;
  patientName: string;
  medicationName: string;
  rxnormCode: string | null;
  quantity: string;
  daysSupply: number | null;
  refillsAuthorized: number;
  directions: string;
  pharmacyNcpdpId: string;
  isControlledSubstance: boolean;
  deaSchedule: string | null;
}

export interface PrescriptionReceipt {
  externalId: string;
  status: 'accepted' | 'rejected';
  rejectReason: string | null;
  transmittedAt: Date;
}

export interface RefillResponseSubmission {
  externalId: string;
  approved: boolean;
  deniedReason: string | null;
}

/**
 * EHR_BUILD_SPEC.md §14 ("ePrescribing / EPCS"): "Do not build pharmacy-network connectivity from
 * scratch for v1... create an adapter interface." No real Surescripts-connected vendor (DoseSpot,
 * DrFirst, or equivalent) exists to integrate against yet — same pattern as ADR-0002's
 * IdentityProvider/ObjectStorageGateway and Phase 4's LabOrderGateway. `NoopPrescribingGateway` is
 * the only implementation; a real one plugs in later without touching `domains/medication`'s
 * `prescription/` call sites.
 *
 * This interface intentionally has no EPCS-specific method — real EPCS requires DEA-compliant
 * identity-proofing/2FA/certified transmission that a generic `sendPrescription` call cannot
 * represent (see EHR_REGULATORY_MANUAL.md §12.2). Controlled-substance prescriptions still flow
 * through `sendPrescription`/`cancelPrescription`/`refillResponse` in this build; a real EPCS
 * vendor integration would likely need a separate, gated code path, not just a swapped adapter.
 */
export interface PrescribingGateway {
  searchMedication(query: string): Promise<MedicationConcept[]>;
  searchPharmacy(query: string): Promise<Pharmacy[]>;
  getFormulary(medicationCode: string): Promise<FormularyInfo>;
  sendPrescription(submission: PrescriptionSubmission): Promise<PrescriptionReceipt>;
  cancelPrescription(externalId: string): Promise<void>;
  refillResponse(response: RefillResponseSubmission): Promise<void>;
}
