import { describe, expect, it } from 'vitest';
import { parseBai2 } from './parse-bai2.js';
import { Bai2ParseError } from './errors.js';

function sampleFile(): string {
  return [
    '01,BANKID,CUSTID,260101,0800,1,,,2/',
    '02,CUSTID,BANKID,1,260101,,USD,/',
    '03,1234567,USD,010,1000000,,Z/',
    '16,195,25000,Z,DEP001,,PAYER ABC EFT/',
    '16,195,15000,Z,DEP002,,PAYER XYZ EFT/',
    '49,1040000,4/',
    '98,1040000,1,6/',
    '99,1040000,1,8/',
  ].join('\n');
}

describe('parseBai2', () => {
  it('parses the full file/group/account/transaction hierarchy', () => {
    const { file, warnings } = parseBai2(sampleFile());
    expect(warnings).toEqual([]);
    expect(file.senderId).toBe('BANKID');
    expect(file.fileCreationDate).toBe('260101');
    expect(file.groups).toHaveLength(1);

    const group = file.groups[0]!;
    expect(group.originatorId).toBe('BANKID');
    expect(group.accounts).toHaveLength(1);

    const account = group.accounts[0]!;
    expect(account.accountNumber).toBe('1234567');
    expect(account.currencyCode).toBe('USD');
    expect(account.summaries).toEqual([{ typeCode: '010', amountCents: 1000000, itemCount: null, fundsType: 'Z' }]);
    expect(account.transactions).toHaveLength(2);
    expect(account.transactions[0]).toEqual({
      typeCode: '195',
      amountCents: 25000,
      fundsType: 'Z',
      bankReferenceNumber: 'DEP001',
      customerReferenceNumber: null,
      text: 'PAYER ABC EFT',
    });
    expect(account.controlTotalCents).toBe(1040000);
  });

  it('merges a continuation (88) record into the preceding transaction text', () => {
    const raw = [
      '01,BANKID,CUSTID,260101,0800,1,,,2/',
      '02,CUSTID,BANKID,1,260101,,USD,/',
      '03,1234567,USD/',
      '16,195,25000,Z,DEP001,,PAYER ABC EFT REMIT/',
      '88,INFO CONTINUED HERE/',
      '49,25000,3/',
      '98,25000,1,5/',
      '99,25000,1,7/',
    ].join('\n');
    const { file } = parseBai2(raw);
    expect(file.groups[0]!.accounts[0]!.transactions[0]!.text).toBe('PAYER ABC EFT REMIT INFO CONTINUED HERE');
  });

  it('warns (does not throw) when a trailer control total does not match the sum of its records', () => {
    const raw = [
      '01,BANKID,CUSTID,260101,0800,1,,,2/',
      '02,CUSTID,BANKID,1,260101,,USD,/',
      '03,1234567,USD/',
      '16,195,25000,Z,DEP001,,EFT/',
      '49,999,2/',
      '98,999,1,4/',
      '99,999,1,6/',
    ].join('\n');
    const { warnings } = parseBai2(raw);
    expect(warnings.some((w) => w.includes('Account 1234567'))).toBe(true);
  });

  it('throws Bai2ParseError when the file trailer is missing', () => {
    const raw = ['01,BANKID,CUSTID,260101,0800,1,,,2/', '02,CUSTID,BANKID,1,260101,,USD,/', '03,1234567,USD/', '49,0,2/', '98,0,1,3/'].join('\n');
    expect(() => parseBai2(raw)).toThrow(Bai2ParseError);
  });

  it('tokenizes by the "/" record terminator, not by newline, so records packed on one line still parse', () => {
    const raw = '01,BANKID,CUSTID,260101,0800,1,,,2/02,CUSTID,BANKID,1,260101,,USD,/03,1234567,USD/49,0,2/98,0,1,4/99,0,1,5/';
    const { file } = parseBai2(raw);
    expect(file.groups[0]!.accounts[0]!.accountNumber).toBe('1234567');
  });
});
