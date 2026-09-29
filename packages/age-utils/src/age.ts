/**
 * A single, shared "how old is this patient" calculation — previously duplicated privately inside
 * `domains/claims`'s newborn claim-scrubbing check. Deliberately just arithmetic: no state-law
 * age-of-majority/age-of-consent table lives here or anywhere else in this codebase (see
 * `domains/consent`'s own README and migration `0029_patient_proxy_grants.ts`'s doc comment — real
 * per-state legal rule content is a business/legal-review gate, not an engineering one). Consumers
 * that need an age *threshold* (e.g. `packages/alerting`'s `minor_consent_transition` rule) own
 * that threshold themselves, as a plain configurable number, never a legal determination baked in
 * here.
 */
export function ageInYears(dateOfBirth: Date | string, asOf: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    asOf.getUTCMonth() > dob.getUTCMonth() || (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}
