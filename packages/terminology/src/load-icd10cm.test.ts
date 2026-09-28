import { describe, expect, it } from 'vitest';
import { formatIcd10Code, parseIcd10CmOrderLine } from './load-icd10cm.js';

describe('formatIcd10Code', () => {
  it('leaves a 3-character code unchanged', () => {
    expect(formatIcd10Code('A00')).toBe('A00');
  });

  it('inserts a decimal point after the first 3 characters', () => {
    expect(formatIcd10Code('E119')).toBe('E11.9');
    expect(formatIcd10Code('S72001A')).toBe('S72.001A');
  });
});

describe('parseIcd10CmOrderLine', () => {
  // Real lines from CMS's FY2027 icd10cm_order_2027.txt, byte-for-byte (fixed-width columns).
  const headerLine = '00001 A00     0 Cholera                                                      Cholera';
  const billableLine =
    '00002 A000    1 Cholera due to Vibrio cholerae 01, biovar cholerae           Cholera due to Vibrio cholerae 01, biovar cholerae';
  const diabetesLine =
    '04421 E119    1 Type 2 diabetes mellitus without complications               Type 2 diabetes mellitus without complications';

  it('parses a non-billable category header, formatting the code and keeping billable false', () => {
    expect(parseIcd10CmOrderLine(headerLine)).toEqual({ code: 'A00', display: 'Cholera', billable: false });
  });

  it('parses a billable code, inserting the decimal point', () => {
    expect(parseIcd10CmOrderLine(billableLine)).toEqual({
      code: 'A00.0',
      display: 'Cholera due to Vibrio cholerae 01, biovar cholerae',
      billable: true,
    });
  });

  it('parses a longer billable code correctly', () => {
    expect(parseIcd10CmOrderLine(diabetesLine)).toEqual({
      code: 'E11.9',
      display: 'Type 2 diabetes mellitus without complications',
      billable: true,
    });
  });

  it('handles a trailing CRLF line ending', () => {
    expect(parseIcd10CmOrderLine(billableLine + '\r')).toEqual({
      code: 'A00.0',
      display: 'Cholera due to Vibrio cholerae 01, biovar cholerae',
      billable: true,
    });
  });

  it('returns null for a blank or malformed line', () => {
    expect(parseIcd10CmOrderLine('')).toBeNull();
    expect(parseIcd10CmOrderLine('not a real line')).toBeNull();
  });
});
