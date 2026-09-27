export interface InteractionCheckInput {
  /** RxNorm codes for the patient's currently active medications, plus the one being newly
   * prescribed — nulls (unmapped/free-text medications) are dropped by the caller before this
   * point, since there is nothing for a code-based check to compare them against. */
  rxnormCodes: string[];
  /** Coded values from the patient's active allergies — `domains/clinical`'s Allergy is mostly
   * free text (`substance`), so this list will often be empty even when the patient has recorded
   * allergies; only allergies with a real `code` populated can ever appear here. */
  allergyCodes: string[];
}

export type InteractionSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor';

export interface InteractionFinding {
  severity: InteractionSeverity;
  description: string;
  /** The two codes involved (drug-drug: two rxnormCodes; drug-allergy: one rxnormCode + one
   * allergyCode) — kept as an untyped pair since real interaction databases return one of several
   * shapes here and this stub never actually populates it. */
  involvedCodes: string[];
}

/**
 * EHR_BUILD_SPEC.md §14/§26 Phase K's "clinical-safety plumbing": an adapter interface only — no
 * licensed drug-interaction/drug-allergy database (e.g. First Databank, Medi-Span, Multum) is
 * connected in this environment, and none can be connected without a real commercial license this
 * repo has no path to obtain. This mirrors every other vendor-boundary adapter in this codebase
 * (`LabOrderGateway`, `PrescribingGateway`, `ObjectStorageGateway`, ...): the interface is real and
 * wired into the real prescribing flow (`domains/medication`'s `PrescriptionService`) today, so a
 * real implementation can be swapped in later without touching any call site — but
 * `NoopInteractionCheckGateway` is the only implementation that exists, and it MUST NEVER be
 * presented to a clinician as a real safety check having been performed. See its own doc comment.
 */
export interface InteractionCheckGateway {
  checkInteractions(input: InteractionCheckInput): Promise<InteractionFinding[]>;
}
