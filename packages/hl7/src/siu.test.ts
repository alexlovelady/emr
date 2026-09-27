import { describe, expect, it } from 'vitest';
import { parseSiuMessage } from './siu.js';
import { Hl7ParseError } from './errors.js';

const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const PRACTITIONER_ID = '33333333-3333-4333-8333-333333333333';
const LOCATION_ID = '44444444-4444-4444-8444-444444444444';

function buildNewMessage(controlId = 'SIUMSG001'): string {
  return [
    `MSH|^~\\&|SCHED_SYSTEM|EXTERNAL_SCHED|EHR|TENANT_A|20260926120000||SIU^S12|${controlId}|P|2.5.1`,
    `SCH|||||||office_visit||||20270115090000^20270115093000`,
    `PID|1||${PATIENT_ID}^^^MRN||DOE^JANE||19800101|F`,
    `AIP|1||${PRACTITIONER_ID}`,
    `AIL|1||${LOCATION_ID}`,
  ].join('\r');
}

function buildCancelMessage(controlId = 'SIUMSG002'): string {
  return [
    `MSH|^~\\&|SCHED_SYSTEM|EXTERNAL_SCHED|EHR|TENANT_A|20260926120000||SIU^S15|${controlId}|P|2.5.1`,
    `SCH|${APPOINTMENT_ID}`,
  ].join('\r');
}

describe('parseSiuMessage', () => {
  it('parses a new-appointment (S12) message', () => {
    const parsed = parseSiuMessage(buildNewMessage());
    expect(parsed.messageType).toBe('SIU^S12');
    expect(parsed.triggerEvent).toBe('S12');
    expect(parsed.patientIdentifier).toBe(PATIENT_ID);
    expect(parsed.practitionerId).toBe(PRACTITIONER_ID);
    expect(parsed.locationId).toBe(LOCATION_ID);
    expect(parsed.appointmentType).toBe('office_visit');
    expect(parsed.scheduledStart?.toISOString()).toBe('2027-01-15T09:00:00.000Z');
    expect(parsed.scheduledEnd?.toISOString()).toBe('2027-01-15T09:30:00.000Z');
  });

  it('parses a cancel (S15) message keyed only by placer appointment id', () => {
    const parsed = parseSiuMessage(buildCancelMessage());
    expect(parsed.messageType).toBe('SIU^S15');
    expect(parsed.placerAppointmentId).toBe(APPOINTMENT_ID);
  });

  it('rejects an unsupported trigger event', () => {
    const bad = buildNewMessage().replace('SIU^S12', 'SIU^S99');
    expect(() => parseSiuMessage(bad)).toThrow(/Unsupported message type/);
  });

  it('rejects a non-SIU message type', () => {
    const adt = buildNewMessage().replace('SIU^S12', 'ADT^A01');
    expect(() => parseSiuMessage(adt)).toThrow(Hl7ParseError);
  });

  it('rejects a message with no SCH segment', () => {
    const noSch = buildNewMessage()
      .split('\r')
      .filter((line) => !line.startsWith('SCH'))
      .join('\r');
    expect(() => parseSiuMessage(noSch)).toThrow(/Missing SCH/);
  });
});
