import { describe, expect, it } from 'vitest';
import { parseDose, validateDose, convertDose } from './dose.js';

describe('parseDose', () => {
  it.each([
    ['500 mg', { amount: 500, unit: 'mg', dimension: 'mass' }],
    ['500mg', { amount: 500, unit: 'mg', dimension: 'mass' }],
    ['2.5 mL', { amount: 2.5, unit: 'mL', dimension: 'volume' }],
    ['1 tablet', { amount: 1, unit: 'tablet', dimension: 'tablet' }],
    ['2 tablets', { amount: 2, unit: 'tablet', dimension: 'tablet' }],
    ['10 Units', { amount: 10, unit: 'unit', dimension: 'unit' }],
    ['0.5 g', { amount: 0.5, unit: 'g', dimension: 'mass' }],
    ['40 mEq', { amount: 40, unit: 'mEq', dimension: 'meq' }],
    ['1 patch', { amount: 1, unit: 'patch', dimension: 'patch' }],
  ])('parses %s', (raw, expected) => {
    expect(parseDose(raw)).toEqual(expected);
  });

  it.each([
    ['500'], // no unit at all
    ['mg'], // no amount
    ['500 xyzzy'], // unrecognized unit
    ['5 mg/mL'], // compound concentration form — deliberately not a parseable dose amount
    [''],
    ['as directed'],
  ])('returns null for %s', (raw) => {
    expect(parseDose(raw)).toBeNull();
  });
});

describe('validateDose', () => {
  it('is valid (no errors) for a well-formed, plausible dose', () => {
    const result = validateDose('500 mg');
    expect(result.errors).toEqual([]);
    expect(result.parsed).toEqual({ amount: 500, unit: 'mg', dimension: 'mass' });
  });

  it('errors on an unparseable dose', () => {
    const result = validateDose('take some');
    expect(result.parsed).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('errors on a zero or negative amount', () => {
    expect(validateDose('0 mg').errors.length).toBeGreaterThan(0);
    expect(validateDose('-5 mg').parsed).toBeNull(); // the regex itself doesn't match a leading '-'
  });

  it('warns (does not error) on an implausibly large mass dose', () => {
    const result = validateDose('50000 mg');
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on an implausibly large volume dose', () => {
    const result = validateDose('10000 mL');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('does not warn on a normal tablet count, even a fairly high one', () => {
    // Count-like units (tablet, capsule, ...) have no implausibility threshold — there is no
    // universal "too many tablets" magnitude the way there is for a raw mass/volume amount.
    const result = validateDose('12 tablets');
    expect(result.warnings).toEqual([]);
  });

  it('does not warn on a plausible small dose', () => {
    const result = validateDose('500 mg');
    expect(result.warnings).toEqual([]);
  });
});

describe('convertDose', () => {
  it('converts within the mass dimension', () => {
    const parsed = parseDose('1 g')!;
    expect(convertDose(parsed, 'mg')).toEqual({ amount: 1000, unit: 'mg', dimension: 'mass' });
    expect(convertDose(parsed, 'mcg')).toEqual({ amount: 1_000_000, unit: 'mcg', dimension: 'mass' });
  });

  it('converts within the volume dimension', () => {
    const parsed = parseDose('1 L')!;
    expect(convertDose(parsed, 'mL')).toEqual({ amount: 1000, unit: 'mL', dimension: 'volume' });
  });

  it('round-trips mass conversion', () => {
    const parsed = parseDose('250 mcg')!;
    const asMg = convertDose(parsed, 'mg')!;
    expect(asMg.amount).toBeCloseTo(0.25);
    const backToMcg = convertDose(asMg, 'mcg')!;
    expect(backToMcg.amount).toBeCloseTo(250);
  });

  it('refuses cross-dimension conversion (mass to volume)', () => {
    const parsed = parseDose('500 mg')!;
    expect(convertDose(parsed, 'mL')).toBeNull();
  });

  it('refuses conversion between two distinct count-like units (tablet to capsule)', () => {
    const parsed = parseDose('2 tablets')!;
    expect(convertDose(parsed, 'capsule')).toBeNull();
  });

  it('refuses conversion to an unrecognized unit', () => {
    const parsed = parseDose('500 mg')!;
    expect(convertDose(parsed, 'bananas')).toBeNull();
  });
});
