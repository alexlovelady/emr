import { describe, expect, it } from 'vitest';
import { parseRxNormLine } from './load-rxnorm.js';

/** Builds a syntactically valid RXNCONSO.RRF line (18 pipe-delimited fields) with overridable
 * fields, so each test only has to state what it's actually varying. */
function buildLine(overrides: Partial<Record<'rxcui' | 'lat' | 'ispref' | 'sab' | 'tty' | 'code' | 'str' | 'suppress', string>> = {}): string {
  const fields = [
    overrides.rxcui ?? '861007', // 0 RXCUI
    overrides.lat ?? 'ENG', // 1 LAT
    'P', // 2 TS
    'L861006', // 3 LUI
    'PF', // 4 STT
    'S2168767', // 5 SUI
    overrides.ispref ?? 'Y', // 6 ISPREF
    '3153173', // 7 RXAUI
    '', // 8 SAUI
    '', // 9 SCUI
    '', // 10 SDUI
    overrides.sab ?? 'RXNORM', // 11 SAB
    overrides.tty ?? 'SCD', // 12 TTY
    overrides.code ?? '861007', // 13 CODE
    overrides.str ?? 'Metformin hydrochloride 500 MG Oral Tablet', // 14 STR
    '', // 15 SRL
    overrides.suppress ?? 'N', // 16 SUPPRESS
    '', // 17 CVF
  ];
  return fields.join('|');
}

describe('parseRxNormLine', () => {
  it('parses a prescribable RXNORM row', () => {
    expect(parseRxNormLine(buildLine())).toEqual({
      code: '861007',
      display: 'Metformin hydrochloride 500 MG Oral Tablet',
    });
  });

  it('handles a trailing CRLF line ending', () => {
    expect(parseRxNormLine(buildLine() + '\r')).toEqual({
      code: '861007',
      display: 'Metformin hydrochloride 500 MG Oral Tablet',
    });
  });

  it('rejects a non-English row', () => {
    expect(parseRxNormLine(buildLine({ lat: 'SPA' }))).toBeNull();
  });

  it('rejects a cross-referenced source vocabulary row, not RxNorm itself', () => {
    expect(parseRxNormLine(buildLine({ sab: 'SNOMEDCT_US' }))).toBeNull();
  });

  it('rejects a non-preferred synonym row', () => {
    expect(parseRxNormLine(buildLine({ ispref: 'N' }))).toBeNull();
  });

  it('rejects a suppressed (obsolete) row', () => {
    expect(parseRxNormLine(buildLine({ suppress: 'O' }))).toBeNull();
  });

  it('rejects a non-prescribable term type (an ingredient, not a clinical drug)', () => {
    expect(parseRxNormLine(buildLine({ tty: 'IN' }))).toBeNull();
  });

  it('accepts every prescribable term type', () => {
    for (const tty of ['SCD', 'SBD', 'GPCK', 'BPCK']) {
      expect(parseRxNormLine(buildLine({ tty }))).not.toBeNull();
    }
  });

  it('returns null for a blank or short-field line', () => {
    expect(parseRxNormLine('')).toBeNull();
    expect(parseRxNormLine('861007|ENG')).toBeNull();
  });
});
