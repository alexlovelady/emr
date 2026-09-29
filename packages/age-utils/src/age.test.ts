import { describe, expect, it } from 'vitest';
import { ageInYears } from './age.js';

describe('ageInYears', () => {
  it('computes a full year of age when the birthday already passed this year', () => {
    expect(ageInYears('2000-01-01', new Date('2026-06-15T00:00:00Z'))).toBe(26);
  });

  it('has not yet incremented when the birthday has not happened yet this year', () => {
    expect(ageInYears('2000-12-31', new Date('2026-06-15T00:00:00Z'))).toBe(25);
  });

  it('counts the birthday itself as the new age', () => {
    expect(ageInYears('2000-06-15', new Date('2026-06-15T00:00:00Z'))).toBe(26);
  });

  it('counts the day before a birthday as the prior age', () => {
    expect(ageInYears('2000-06-15', new Date('2026-06-14T00:00:00Z'))).toBe(25);
  });

  it('accepts a Date object as well as a string', () => {
    expect(ageInYears(new Date('2000-01-01T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(26);
  });

  it('defaults asOf to now', () => {
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
    expect(ageInYears(eighteenYearsAgo)).toBe(18);
  });

  it('handles a leap-year birthday (Feb 29)', () => {
    expect(ageInYears('2000-02-29', new Date('2026-03-01T00:00:00Z'))).toBe(26);
    expect(ageInYears('2000-02-29', new Date('2026-02-28T00:00:00Z'))).toBe(25);
  });
});
