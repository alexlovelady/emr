import { Hl7ParseError } from './errors.js';
import { splitSegments, parseMsh, findSegment, formatHl7DateTime } from './segment-utils.js';

export interface ParsedSiuMessage {
  messageControlId: string;
  messageType: string;
  triggerEvent: string;
  /** SCH-1 — this system's own appointment UUID, for correlating an update/cancel to an existing
   * booking. Absent (or ignored) on a new-appointment (S12) message, since a new appointment gets
   * a freshly generated id. */
  placerAppointmentId: string | null;
  /** PID-3 — this system's own patient UUID, same correlation convention as `adt.ts`. */
  patientIdentifier: string | null;
  /** AIP-3 — this system's own practitioner UUID. */
  practitionerId: string | null;
  /** AIL-3 — this system's own location UUID. */
  locationId: string | null;
  appointmentType: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
}

const SUPPORTED_TRIGGER_EVENTS = new Set(['S12', 'S14', 'S15']);

/**
 * A real-but-minimal SIU parser covering new (S12), update (S14), and cancel (S15) appointment
 * notifications. Real-world SIU messages carry resource assignment across several dedicated
 * segments (AIS for the service, AIG for general resources, AIL for locations, AIP for
 * personnel) with a fairly involved repeating-segment structure; this parser reads only the
 * single AIP/AIL occurrence needed to identify a practitioner/location, and packs the appointment
 * window into SCH-11 as `start^end` (HL7 datetimes) rather than modeling a full TQ1-style timing
 * quantity — a deliberate simplification in the same spirit as `oru-r01.ts`'s "real-but-minimal"
 * framing, not full HL7 v2.5.1 SIU conformance.
 *
 * `placerAppointmentId` (SCH-1) and `patientIdentifier`/`practitionerId`/`locationId` are expected
 * to carry this system's own UUIDs, not external identifiers — see `adt.ts`'s doc comment for why.
 */
export function parseSiuMessage(raw: string): ParsedSiuMessage {
  const segments = splitSegments(raw);
  const { fieldSep, messageType, triggerEvent, messageTypeField, messageControlId } = parseMsh(segments);
  if (messageType !== 'SIU' || !SUPPORTED_TRIGGER_EVENTS.has(triggerEvent)) {
    throw new Hl7ParseError(`Unsupported message type: ${messageTypeField || '(missing MSH-9)'}`);
  }

  const schFields = findSegment(segments, 'SCH', fieldSep);
  if (!schFields) throw new Hl7ParseError('Missing SCH segment');
  const timingField = schFields[11] ?? '';
  const [startRaw, endRaw] = timingField.split('^');

  const pidFields = findSegment(segments, 'PID', fieldSep) ?? [];
  const aipFields = findSegment(segments, 'AIP', fieldSep) ?? [];
  const ailFields = findSegment(segments, 'AIL', fieldSep) ?? [];

  return {
    messageControlId,
    messageType: `${messageType}^${triggerEvent}`,
    triggerEvent,
    placerAppointmentId: schFields[1] || null,
    patientIdentifier: (pidFields[3] ?? '').split('^')[0] || null,
    practitionerId: aipFields[3] || null,
    locationId: ailFields[3] || null,
    appointmentType: schFields[7] || null,
    scheduledStart: formatHl7DateTime(startRaw),
    scheduledEnd: formatHl7DateTime(endRaw),
  };
}
