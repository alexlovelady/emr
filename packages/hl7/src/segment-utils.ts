import { Hl7ParseError } from './errors.js';

/** Splits on CR (the real HL7 segment terminator) but accepts LF too, so hand-written test
 * fixtures don't need literal carriage returns. */
export function splitSegments(raw: string): string[] {
  return raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface MshInfo {
  fieldSep: string;
  messageType: string;
  triggerEvent: string;
  messageTypeField: string;
  messageControlId: string;
}

/**
 * Parses MSH far enough to identify the message. Every OTHER segment type's field `N` sits at
 * array index `N` (segment name at index 0) once split on the field separator — MSH is the one
 * exception: MSH-1 *is* the field separator character itself, so it isn't a real split element,
 * which shifts every subsequent MSH field left by one array slot relative to its field number
 * (`mshFields[8]` is MSH-9, `mshFields[9]` is MSH-10, etc.).
 */
export function parseMsh(segments: string[]): MshInfo {
  const msh = segments.find((s) => s.startsWith('MSH'));
  if (!msh) throw new Hl7ParseError('Missing MSH segment');

  const fieldSep = msh.charAt(3);
  const mshFields = msh.split(fieldSep);
  const messageTypeField = mshFields[8] ?? '';
  const [messageType = '', triggerEvent = ''] = messageTypeField.split('^');
  const messageControlId = mshFields[9] ?? '';
  if (!messageControlId) throw new Hl7ParseError('Missing MSH-10 (message control ID)');

  return { fieldSep, messageType, triggerEvent, messageTypeField, messageControlId };
}

/** Peeks a raw message's message type/control id without validating anything type-specific —
 * used by apps/interop-hl7's dispatcher to decide which parser to call before fully parsing. */
export function peekMessageType(raw: string): { messageType: string; triggerEvent: string; messageControlId: string } {
  const { messageType, triggerEvent, messageControlId } = parseMsh(splitSegments(raw));
  return { messageType, triggerEvent, messageControlId };
}

/** First occurrence of segment `name`, split into fields (index 0 is the segment name itself). */
export function findSegment(segments: string[], name: string, fieldSep: string): string[] | null {
  const seg = segments.find((s) => s.startsWith(name + fieldSep));
  return seg ? seg.split(fieldSep) : null;
}

/** Every occurrence of segment `name` (e.g. repeated OBX), each split into fields. */
export function findSegments(segments: string[], name: string, fieldSep: string): string[][] {
  return segments.filter((s) => s.startsWith(name + fieldSep)).map((s) => s.split(fieldSep));
}

/** An HL7 date (`YYYYMMDD...`) as a plain `YYYY-MM-DD` string, or null if not a recognizable date. */
export function formatHl7Date(value: string | undefined): string | null {
  if (!value || !/^\d{8}/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** An HL7 datetime (`YYYYMMDDHHmmss`) as a `Date`, or null if not a recognizable datetime. */
export function formatHl7DateTime(value: string | undefined): Date | null {
  if (!value || !/^\d{14}/.test(value)) return null;
  const y = value.slice(0, 4);
  const mo = value.slice(4, 6);
  const d = value.slice(6, 8);
  const h = value.slice(8, 10);
  const mi = value.slice(10, 12);
  const s = value.slice(12, 14);
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
