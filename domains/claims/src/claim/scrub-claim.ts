import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { ChargeRow } from '@ehr/billing';
import type { CoverageRow, PatientRow } from '@ehr/patient';
import { TerminologyService } from '@ehr/terminology';

type Executor = Kysely<DB> | Transaction<DB>;

const CPT_PATTERN = /^\d{5}$/;
const HCPCS_PATTERN = /^[A-Z]\d{4}$/;

/**
 * A small, explicitly-labeled starter set of well-known ICD-10-CM sex/age restrictions — NOT the
 * full CMS "sex edits"/"age edits" reference files (which this system doesn't load). Chosen because
 * they're uncontroversial, chapter-level conventions unlikely to ever be wrong: pregnancy/childbirth
 * codes are female-only, male-genital-organ codes are male-only, and perinatal/newborn/liveborn
 * codes only apply to a patient who was 0 years old at the encounter. Extend this table if/when a
 * real CMS edits file is ever loaded — don't hand-add more heuristics past what's genuinely
 * unambiguous at the chapter level.
 */
const SEX_RESTRICTED_PREFIXES: { test: (code: string) => boolean; sex: 'F' | 'M'; label: string }[] = [
  { test: (c) => /^O/.test(c) || /^Z3[4678]/.test(c) || /^Z3A/.test(c), sex: 'F', label: 'pregnancy/childbirth' },
  { test: (c) => /^N4[0-9]/.test(c) || /^N5[0-3]/.test(c), sex: 'M', label: 'male genital organs' },
];
const NEWBORN_ONLY_PREFIX = /^(P[0-9]|Z38)/;

export interface ScrubClaimInput {
  totalChargeAmount: number;
  charges: ChargeRow[];
  coverage: CoverageRow | null;
  patient: PatientRow;
  /** The encounter date charges were incurred on — used for the newborn-code age check. */
  encounterDate: Date;
}

/**
 * EHR_BUILD_SPEC.md §13.1: "claim scrubber rules unique to product/customer" is an explicit
 * **build** item, not a stub. Real checks, honestly scoped to what this system can actually verify
 * without a real clearinghouse or CMS edits data:
 *
 * - Charge/code format completeness (original scrubber, unchanged).
 * - Diagnosis codes are real, billable ICD-10-CM codes (via `@ehr/terminology`'s locally-loaded
 *   catalog) — not just format-shaped strings. `checked: false` (terminology unloaded) never blocks
 *   submission, same "warn, don't hard-block" rule the terminology service itself follows.
 * - Coverage status/effective-dates, if a coverage is attached — an inactive or not-yet-effective/
 *   expired coverage at the time of the encounter is a real reason a claim would deny.
 * - Subscriber consistency — a non-"self" `subscriberRelationship` with no `subscriberName` on file
 *   is a real subscriber-mismatch risk (see migration `0038`'s doc comment).
 * - The most recent eligibility check on file for the attached coverage, if any — an explicitly
 *   ineligible result blocks; no check on file is a same-severity issue as "coverage not verified",
 *   not silently ignored, but distinct wording so staff know what to do about each.
 * - A small starter set of sex/age conflicts (see `SEX_RESTRICTED_PREFIXES` above).
 *
 * Self-pay claims (`coverage: null`) skip every coverage/subscriber/eligibility check entirely —
 * there's no payer to verify any of that against.
 */
export async function scrubClaim(trx: Executor, tenantId: string, input: ScrubClaimInput): Promise<string[]> {
  const issues: string[] = [];
  const { totalChargeAmount, charges, coverage, patient, encounterDate } = input;

  if (charges.length === 0) {
    issues.push('Claim has no charges');
  }
  if (!(totalChargeAmount > 0)) {
    issues.push('Claim total charge amount must be positive');
  }

  const terminology = new TerminologyService();
  for (const charge of charges) {
    const pattern = charge.codeSystem === 'CPT' ? CPT_PATTERN : charge.codeSystem === 'HCPCS' ? HCPCS_PATTERN : null;
    if (!pattern) {
      issues.push(`Charge ${charge.id} has an unrecognized code system: ${charge.codeSystem}`);
      continue;
    }
    if (!pattern.test(charge.code)) {
      issues.push(`Charge ${charge.id} has an invalid ${charge.codeSystem} code: ${charge.code}`);
    }
    if (charge.diagnosisCodes.length === 0) {
      issues.push(`Charge ${charge.id} has no diagnosis codes`);
      continue;
    }

    for (const dxCode of charge.diagnosisCodes) {
      const validation = await terminology.validateCode(trx, 'ICD-10', dxCode);
      if (validation.checked && !validation.valid) {
        issues.push(`Charge ${charge.id} has a diagnosis code not found in ICD-10-CM: ${dxCode}`);
      }
      const sexConflict = checkSexConflict(dxCode, patient.sexAtBirth);
      if (sexConflict) issues.push(`Charge ${charge.id}'s diagnosis ${dxCode} (${sexConflict}) conflicts with the patient's recorded sex`);
      if (NEWBORN_ONLY_PREFIX.test(dxCode) && ageInYears(patient.dateOfBirth, encounterDate) !== 0) {
        issues.push(`Charge ${charge.id}'s diagnosis ${dxCode} is a newborn/perinatal-only code, but the patient wasn't 0 years old at the encounter`);
      }
    }
  }

  if (coverage) {
    if (coverage.status !== 'active') {
      issues.push(`Coverage ${coverage.id} is not active (status: ${coverage.status})`);
    }
    if (new Date(coverage.effectiveStart) > encounterDate) {
      issues.push(`Coverage ${coverage.id} was not yet effective on the encounter date`);
    }
    if (coverage.effectiveEnd && new Date(coverage.effectiveEnd) < encounterDate) {
      issues.push(`Coverage ${coverage.id} had already expired on the encounter date`);
    }
    if (coverage.subscriberRelationship !== 'self' && !coverage.subscriberName) {
      issues.push(`Coverage ${coverage.id} has a non-self subscriber relationship (${coverage.subscriberRelationship}) but no subscriber name on file`);
    }

    const latestEligibility = await trx
      .selectFrom('eligibility_checks')
      .select(['is_eligible'])
      .where('tenant_id', '=', tenantId)
      .where('coverage_id', '=', coverage.id)
      .orderBy('checked_at', 'desc')
      .executeTakeFirst();
    if (!latestEligibility) {
      issues.push(`Coverage ${coverage.id} has never had an eligibility check on file`);
    } else if (!latestEligibility.is_eligible) {
      issues.push(`Coverage ${coverage.id}'s most recent eligibility check reported the patient as not eligible`);
    }
  }

  return issues;
}

function checkSexConflict(diagnosisCode: string, sexAtBirth: string | null): string | null {
  if (!sexAtBirth) return null;
  const normalized = sexAtBirth.trim().toUpperCase();
  if (normalized !== 'F' && normalized !== 'M') return null;

  for (const rule of SEX_RESTRICTED_PREFIXES) {
    if (rule.test(diagnosisCode) && rule.sex !== normalized) return rule.label;
  }
  return null;
}

function ageInYears(dateOfBirth: string, asOf: Date): number {
  const dob = new Date(dateOfBirth);
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    asOf.getUTCMonth() > dob.getUTCMonth() || (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}
