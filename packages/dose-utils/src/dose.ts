/**
 * Item 19's "medication dose/unit validation, unit conversion" sub-gap — a purely structural
 * sanity check (parseable amount + recognized unit, positive, not wildly implausible) intended to
 * catch data-entry errors (a missing unit, "500" with nothing after it, a typo'd unit string).
 * This is deliberately NOT a per-drug clinical dosing check (that needs a licensed drug database —
 * see `packages/interaction-adapter`'s own honest-stub precedent for the same reasoning) and must
 * never be presented to a clinician as one.
 */

export type DoseDimension = 'mass' | 'volume' | string;

interface UnitDef {
  dimension: DoseDimension;
  /** Multiplier to this dimension's base unit (mg for mass, mL for volume; 1 for every
   * self-contained unit, since those have no smaller/larger sibling to convert to/from). */
  toBase: number;
  /** Canonical form returned by `parseDose`/`normalizeUnit` — always singular, lowercase. */
  canonical: string;
}

/**
 * Mass and volume are genuine dimensions with multiple interconvertible units. Every other unit
 * (tablet, capsule, patch, puff, drop, spray, "unit" as in insulin/heparin dosing, mEq) is its own
 * self-contained dimension — a tablet and a capsule are NOT interconvertible, and "5 units" of
 * insulin has no fixed mass/volume equivalent across drugs, so each gets `dimension` equal to its
 * own canonical name rather than being grouped with mass/volume.
 */
const UNIT_TABLE: Record<string, UnitDef> = {
  mcg: { dimension: 'mass', toBase: 0.001, canonical: 'mcg' },
  microgram: { dimension: 'mass', toBase: 0.001, canonical: 'mcg' },
  micrograms: { dimension: 'mass', toBase: 0.001, canonical: 'mcg' },
  mg: { dimension: 'mass', toBase: 1, canonical: 'mg' },
  milligram: { dimension: 'mass', toBase: 1, canonical: 'mg' },
  milligrams: { dimension: 'mass', toBase: 1, canonical: 'mg' },
  g: { dimension: 'mass', toBase: 1000, canonical: 'g' },
  gram: { dimension: 'mass', toBase: 1000, canonical: 'g' },
  grams: { dimension: 'mass', toBase: 1000, canonical: 'g' },
  kg: { dimension: 'mass', toBase: 1_000_000, canonical: 'kg' },

  ml: { dimension: 'volume', toBase: 1, canonical: 'mL' },
  milliliter: { dimension: 'volume', toBase: 1, canonical: 'mL' },
  milliliters: { dimension: 'volume', toBase: 1, canonical: 'mL' },
  l: { dimension: 'volume', toBase: 1000, canonical: 'L' },
  liter: { dimension: 'volume', toBase: 1000, canonical: 'L' },
  liters: { dimension: 'volume', toBase: 1000, canonical: 'L' },

  tablet: { dimension: 'tablet', toBase: 1, canonical: 'tablet' },
  capsule: { dimension: 'capsule', toBase: 1, canonical: 'capsule' },
  patch: { dimension: 'patch', toBase: 1, canonical: 'patch' },
  puff: { dimension: 'puff', toBase: 1, canonical: 'puff' },
  drop: { dimension: 'drop', toBase: 1, canonical: 'drop' },
  spray: { dimension: 'spray', toBase: 1, canonical: 'spray' },
  unit: { dimension: 'unit', toBase: 1, canonical: 'unit' },
  meq: { dimension: 'meq', toBase: 1, canonical: 'mEq' },
};

/** Accepts a plural form of any singular unit above ("tablets", "units", "caps") without a
 * separate table entry for each. */
function lookupUnit(token: string): UnitDef | undefined {
  const lower = token.toLowerCase();
  if (UNIT_TABLE[lower]) return UNIT_TABLE[lower];
  if (lower.endsWith('s') && UNIT_TABLE[lower.slice(0, -1)]) return UNIT_TABLE[lower.slice(0, -1)];
  return undefined;
}

/** Looks up a `UnitDef` by its canonical (already-normalized) form — what every already-`parseDose`d
 * result carries, so callers holding a `ParsedDose` never need to re-run `lookupUnit`'s
 * plural-stripping heuristic on a string that's already canonical. */
function defByCanonical(canonical: string): UnitDef | undefined {
  return Object.values(UNIT_TABLE).find((u) => u.canonical === canonical);
}

export interface ParsedDose {
  amount: number;
  /** Canonical unit string (e.g. "mg", "mL", "tablet") — always singular. */
  unit: string;
  dimension: DoseDimension;
}

const DOSE_PATTERN = /^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/;

/** Parses a free-text dose like "500 mg", "500mg", "2.5 mL", "1 tablet", "10 Units" into a
 * structured amount + canonical unit. Returns `null` if the string isn't a single number followed
 * by a recognized unit — including a compound form like "5 mg/mL", which this deliberately does
 * NOT parse (a concentration, not a dose amount; see `parseDose`'s doc comment in dose-utils'
 * README for why that's out of scope here). */
export function parseDose(raw: string): ParsedDose | null {
  const trimmed = raw.trim();
  const match = DOSE_PATTERN.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  const unitDef = lookupUnit(match[2]!);
  if (!unitDef) return null;
  return { amount, unit: unitDef.canonical, dimension: unitDef.dimension };
}

/** A generous, deliberately non-per-drug magnitude past which a dose is almost certainly a
 * data-entry error (a decimal point or unit typo) rather than a real prescribed amount — NOT a
 * clinical maximum-dose check, which would need a licensed drug database. */
const IMPLAUSIBLE_THRESHOLD_BY_DIMENSION: Record<string, number> = {
  mass: 10_000, // mg equivalent
  volume: 5_000, // mL equivalent
};

export interface DoseValidationResult {
  parsed: ParsedDose | null;
  /** Blocking — the dose could not be safely recorded at all. */
  errors: string[];
  /** Non-blocking — surfaced to the caller/UI, same "warn, don't hard-block" posture as this
   * codebase's other honestly-stubbed safety checks (RxNorm code validation, interaction checks). */
  warnings: string[];
}

export function validateDose(raw: string): DoseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseDose(raw);

  if (!parsed) {
    errors.push(`Dose "${raw}" could not be parsed as a numeric amount plus a recognized unit (e.g. "500 mg", "2.5 mL", "1 tablet")`);
    return { parsed: null, errors, warnings };
  }
  if (parsed.amount <= 0) {
    errors.push('Dose amount must be greater than zero');
  }

  const baseUnitAmount = parsed.amount * (defByCanonical(parsed.unit)?.toBase ?? 1);
  const threshold = IMPLAUSIBLE_THRESHOLD_BY_DIMENSION[parsed.dimension];
  if (threshold !== undefined && baseUnitAmount > threshold) {
    warnings.push(`Dose "${raw}" is unusually large for a ${parsed.dimension} unit — double-check the amount and unit`);
  }

  return { parsed, errors, warnings };
}

/** Converts a parsed dose to a different unit within the SAME dimension only (mg<->g<->mcg,
 * mL<->L) — returns `null` for cross-dimension conversion (e.g. mg to mL, or tablet to mg), since
 * that requires drug-specific concentration data this package deliberately does not have. */
export function convertDose(parsed: ParsedDose, toUnit: string): ParsedDose | null {
  const toDef = lookupUnit(toUnit);
  if (!toDef || toDef.dimension !== parsed.dimension) return null;
  const fromDef = defByCanonical(parsed.unit);
  if (!fromDef) return null;
  const baseAmount = parsed.amount * fromDef.toBase;
  return { amount: baseAmount / toDef.toBase, unit: toDef.canonical, dimension: toDef.dimension };
}
