import { describe, expect, it } from 'vitest';
import { parseOrmMessage } from './orm.js';
import { Hl7ParseError } from './errors.js';

const ENCOUNTER_ID = '55555555-5555-4555-8555-555555555555';
const PRACTITIONER_ID = '33333333-3333-4333-8333-333333333333';

function buildMessage(controlId = 'ORMMSG001'): string {
  const pv1Fields = new Array(20).fill('');
  pv1Fields[0] = 'PV1';
  pv1Fields[19] = ENCOUNTER_ID;
  const obrFields = new Array(17).fill('');
  obrFields[0] = 'OBR';
  obrFields[4] = 'CBC^Complete Blood Count^L';
  obrFields[16] = `${PRACTITIONER_ID}^Smith^Jane`;

  return [
    `MSH|^~\\&|ORDER_SYSTEM|EXTERNAL_ORD|EHR|TENANT_A|20260926120000||ORM^O01|${controlId}|P|2.5.1`,
    pv1Fields.join('|'),
    obrFields.join('|'),
  ].join('\r');
}

describe('parseOrmMessage', () => {
  it('parses a new-order (O01) message', () => {
    const parsed = parseOrmMessage(buildMessage());
    expect(parsed.messageType).toBe('ORM^O01');
    expect(parsed.messageControlId).toBe('ORMMSG001');
    expect(parsed.encounterId).toBe(ENCOUNTER_ID);
    expect(parsed.orderingPractitionerId).toBe(PRACTITIONER_ID);
    expect(parsed.code).toBe('CBC');
    expect(parsed.displayName).toBe('Complete Blood Count');
    expect(parsed.codeSystem).toBe('L');
  });

  it('rejects a non-ORM^O01 message type', () => {
    const adt = buildMessage().replace('ORM^O01', 'ADT^A01');
    expect(() => parseOrmMessage(adt)).toThrow(Hl7ParseError);
  });

  it('rejects a message with no OBR segment', () => {
    const noObr = buildMessage()
      .split('\r')
      .filter((line) => !line.startsWith('OBR'))
      .join('\r');
    expect(() => parseOrmMessage(noObr)).toThrow(/Missing OBR/);
  });
});
