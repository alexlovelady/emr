import { Hl7ParseError } from './errors.js';
import { splitSegments, parseMsh, findSegment, formatHl7Date } from './segment-utils.js';

export interface ParsedAdtMessage {
  messageControlId: string;
  messageType: string;
  triggerEvent: string;
  patientIdentifier: string | null;
  givenName: string | null;
  familyName: string | null;
  middleName: string | null;
  dateOfBirth: string | null;
  sexAtBirth: string | null;
  phone: string | null;
}

const SUPPORTED_TRIGGER_EVENTS = new Set(['A01', 'A02', 'A03', 'A08']);

/**
 * A real-but-minimal ADT parser covering admit (A01), transfer (A02), discharge (A03), and update
 * (A08). This system has no inpatient/bed-management model — `domains/clinical`'s Encounter is
 * strictly the ambulatory roomed→in_progress→documentation→signed→coding_review flow tied to a
 * checked-in appointment — so every supported trigger event does the same thing downstream:
 * synchronize patient demographics from PID (`apps/interop-hl7` calls
 * `PatientService.updateDemographics()`). The trigger event is preserved on the returned message
 * type for audit/logging, but doesn't drive different behavior yet; adding real admit/transfer/
 * discharge tracking would mean designing a bed-management concept this system doesn't have, not
 * just extending this parser.
 *
 * `patientIdentifier` (PID-3) is expected to carry this system's own patient UUID, not an external
 * MRN — the same convention `oru-r01.ts`'s placer-order-number correlation already uses, since no
 * real ADT-sending interface partner (and therefore no real MRN crosswalk) exists to test against.
 */
export function parseAdtMessage(raw: string): ParsedAdtMessage {
  const segments = splitSegments(raw);
  const { fieldSep, messageType, triggerEvent, messageTypeField, messageControlId } = parseMsh(segments);
  if (messageType !== 'ADT' || !SUPPORTED_TRIGGER_EVENTS.has(triggerEvent)) {
    throw new Hl7ParseError(`Unsupported message type: ${messageTypeField || '(missing MSH-9)'}`);
  }

  const pidFields = findSegment(segments, 'PID', fieldSep);
  if (!pidFields) throw new Hl7ParseError('Missing PID segment');

  const patientIdentifierField = pidFields[3] ?? '';
  const patientNameField = pidFields[5] ?? '';
  const [familyName, givenName, middleName] = patientNameField.split('^');
  const phoneField = pidFields[13] ?? '';

  return {
    messageControlId,
    messageType: `${messageType}^${triggerEvent}`,
    triggerEvent,
    patientIdentifier: patientIdentifierField.split('^')[0] || null,
    givenName: givenName || null,
    familyName: familyName || null,
    middleName: middleName || null,
    dateOfBirth: formatHl7Date(pidFields[7]),
    sexAtBirth: pidFields[8] || null,
    phone: phoneField.split('^')[0] || null,
  };
}
