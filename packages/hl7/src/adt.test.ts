import { describe, expect, it } from 'vitest';
import { parseAdtMessage } from './adt.js';
import { Hl7ParseError } from './errors.js';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

function buildMessage(triggerEvent: string, controlId = 'ADTMSG001'): string {
  return [
    `MSH|^~\\&|REG_SYSTEM|EXTERNAL_REG|EHR|TENANT_A|20260926120000||ADT^${triggerEvent}|${controlId}|P|2.5.1`,
    `PID|1||${PATIENT_ID}^^^MRN||DOE^JANE^M||19800101|F|||||5551234567`,
  ].join('\r');
}

describe('parseAdtMessage', () => {
  it.each(['A01', 'A02', 'A03', 'A08'])('parses a supported trigger event %s', (triggerEvent) => {
    const parsed = parseAdtMessage(buildMessage(triggerEvent));
    expect(parsed.messageType).toBe(`ADT^${triggerEvent}`);
    expect(parsed.triggerEvent).toBe(triggerEvent);
    expect(parsed.messageControlId).toBe('ADTMSG001');
    expect(parsed.patientIdentifier).toBe(PATIENT_ID);
    expect(parsed.familyName).toBe('DOE');
    expect(parsed.givenName).toBe('JANE');
    expect(parsed.middleName).toBe('M');
    expect(parsed.dateOfBirth).toBe('1980-01-01');
    expect(parsed.sexAtBirth).toBe('F');
    expect(parsed.phone).toBe('5551234567');
  });

  it('rejects an unsupported trigger event', () => {
    expect(() => parseAdtMessage(buildMessage('A04'))).toThrow(/Unsupported message type/);
  });

  it('rejects a non-ADT message type', () => {
    const oru = buildMessage('A01').replace('ADT^A01', 'ORU^R01');
    expect(() => parseAdtMessage(oru)).toThrow(Hl7ParseError);
  });

  it('rejects a message with no PID segment', () => {
    const noPid = buildMessage('A08')
      .split('\r')
      .filter((line) => !line.startsWith('PID'))
      .join('\r');
    expect(() => parseAdtMessage(noPid)).toThrow(/Missing PID/);
  });
});
