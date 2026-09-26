import type { ChargeRow } from '@ehr/billing';

const CPT_PATTERN = /^\d{5}$/;
const HCPCS_PATTERN = /^[A-Z]\d{4}$/;

/**
 * EHR_BUILD_SPEC.md §13.1: "claim scrubber rules unique to product/customer" is an explicit
 * **build** item, not a stub. Real, if minimal: code-format validation per code system, at least
 * one charge, and a positive total. Returns an empty array when the claim is clean — callers
 * (`ClaimService.submit`) throw a `ValidationError` with these issues rather than mutating
 * anything when the list is non-empty.
 */
export function scrubClaim(totalChargeAmount: number, charges: ChargeRow[]): string[] {
  const issues: string[] = [];

  if (charges.length === 0) {
    issues.push('Claim has no charges');
  }

  if (!(totalChargeAmount > 0)) {
    issues.push('Claim total charge amount must be positive');
  }

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
    }
  }

  return issues;
}
