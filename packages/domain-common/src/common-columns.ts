/**
 * EHR_BUILD_SPEC.md §5.1. Every tenant-owned table carries these columns; every repository
 * row type should extend CommonColumns (and ClinicalFactColumns once clinical domains exist).
 * Do not add ad-hoc timestamp/status columns outside this shape — state machines belong in
 * `status`, not a scatter of boolean flags (spec rule #15).
 */
export interface CommonColumns {
  tenantId: string;
  id: string;
  version: number;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  recordedAt: Date;
  sourceType: string;
  sourceSystem: string | null;
  sourceId: string | null;
  status: string;
  metadata: Record<string, unknown>;
}

/**
 * EHR_BUILD_SPEC.md §5.1. Additional columns for clinical facts only (not used by Phase 1's
 * tenant/workforce/document domains, but defined here now so later domains don't invent their
 * own shape). `effectiveStart`/`effectiveEnd` are the clinically meaningful time — never confuse
 * with `recordedAt`/`createdAt`, which are system insertion time (spec rule #13/#14).
 */
export interface ClinicalFactColumns {
  effectiveStart: Date | null;
  effectiveEnd: Date | null;
  enteredInError: boolean;
  supersedesId: string | null;
  provenanceId: string;
}

/** Source of a record, used to populate sourceType. Extend as new ingestion paths are added. */
export type SourceType = 'user_entered' | 'system_generated' | 'import' | 'interface' | 'ai_generated';
