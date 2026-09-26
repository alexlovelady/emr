import { describe, expect, it } from 'vitest';
import { parseOruR01 } from './oru-r01.js';
import { Hl7ParseError } from './errors.js';

const PLACER_ORDER_ID = '11111111-1111-4111-8111-111111111111';

function buildValidMessage(controlId = 'MSGID12345'): string {
  return [
    `MSH|^~\\&|LAB_SYSTEM|EXTERNAL_LAB|EHR|TENANT_A|20260926120000||ORU^R01|${controlId}|P|2.5.1`,
    'PID|1||PT-9001^^^MRN||DOE^JANE||19800101|F',
    `OBR|1|${PLACER_ORDER_ID}|FILLER-500|CBC^Complete Blood Count^L||20260926110000`,
    'OBX|1|NM|789-8^Erythrocytes^LN||4.5|10*6/uL|4.2-5.4|N|||F',
    'OBX|2|NM|718-7^Hemoglobin^LN||16.9|g/dL|13.5-17.5|H|||F',
  ].join('\r');
}

describe('parseOruR01', () => {
  it('parses MSH/PID/OBR/OBX into a canonical shape', () => {
    const parsed = parseOruR01(buildValidMessage());
    expect(parsed.messageControlId).toBe('MSGID12345');
    expect(parsed.messageType).toBe('ORU^R01');
    expect(parsed.patientIdentifier).toBe('PT-9001');
    expect(parsed.patientFamilyName).toBe('DOE');
    expect(parsed.patientGivenName).toBe('JANE');
    expect(parsed.placerOrderNumber).toBe(PLACER_ORDER_ID);
    expect(parsed.fillerOrderNumber).toBe('FILLER-500');
    expect(parsed.reportCode).toBe('CBC');
    expect(parsed.reportDisplay).toBe('Complete Blood Count');
    expect(parsed.observations).toHaveLength(2);
    expect(parsed.observations[0]).toMatchObject({
      code: '789-8',
      display: 'Erythrocytes',
      codeSystem: 'LN',
      value: '4.5',
      unit: '10*6/uL',
      abnormalFlag: 'N',
      resultStatus: 'F',
    });
    expect(parsed.observations[1]).toMatchObject({ code: '718-7', abnormalFlag: 'H' });
  });

  it('accepts LF-joined segments (not just CR) for hand-written fixtures', () => {
    const parsed = parseOruR01(buildValidMessage().replace(/\r/g, '\n'));
    expect(parsed.observations).toHaveLength(2);
  });

  it('rejects a message with no MSH segment', () => {
    expect(() => parseOruR01('PID|1||PT-1\rOBX|1|NM|1^x^L||1')).toThrow(Hl7ParseError);
  });

  it('rejects a non-ORU^R01 message type', () => {
    const adt = buildValidMessage().replace('ORU^R01', 'ADT^A01');
    expect(() => parseOruR01(adt)).toThrow(/Unsupported message type/);
  });

  it('rejects a message missing MSH-10 (message control ID)', () => {
    const noControlId = buildValidMessage().replace('|MSGID12345|P|2.5.1', '||P|2.5.1');
    expect(() => parseOruR01(noControlId)).toThrow(/message control ID/);
  });

  it('rejects a message with no OBX segments', () => {
    const noObx = buildValidMessage()
      .split('\r')
      .filter((line) => !line.startsWith('OBX'))
      .join('\r');
    expect(() => parseOruR01(noObx)).toThrow(/No OBX/);
  });
});
