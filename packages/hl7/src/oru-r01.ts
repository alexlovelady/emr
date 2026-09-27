import { Hl7ParseError } from './errors.js';
import { splitSegments, parseMsh, findSegment, findSegments } from './segment-utils.js';

export interface ParsedOruObservation {
  code: string | null;
  display: string | null;
  codeSystem: string | null;
  value: string | null;
  valueType: string | null;
  unit: string | null;
  abnormalFlag: string | null;
  resultStatus: string | null;
}

export interface ParsedOruMessage {
  messageControlId: string;
  messageType: string;
  patientIdentifier: string | null;
  patientFamilyName: string | null;
  patientGivenName: string | null;
  placerOrderNumber: string | null;
  fillerOrderNumber: string | null;
  reportCodeSystem: string | null;
  reportCode: string | null;
  reportDisplay: string | null;
  observations: ParsedOruObservation[];
}

/**
 * A real-but-minimal pipe-delimited HL7 v2 parser for exactly one message type: `ORU^R01`
 * (unsolicited result). EHR_BUILD_SPEC.md §26 Phase 4 only needs lab-result ingestion; the
 * eCW/athena parity roadmap's Phase J later added ADT/SIU/ORM (see `adt.ts`/`siu.ts`/`orm.ts`) —
 * MDM and others remain deferred ("... where needed ... as needed" per spec §12).
 *
 * Segment-splitting/MSH-parsing helpers live in `segment-utils.ts`, shared with every other
 * parser in this package. Component (`^`) separators are hardcoded via `.split('^')` here rather
 * than read from MSH-2, since only the standard `^~\&` set is ever actually exercised.
 */
export function parseOruR01(raw: string): ParsedOruMessage {
  const segments = splitSegments(raw);
  const { fieldSep, messageType, triggerEvent, messageTypeField, messageControlId } = parseMsh(segments);
  if (`${messageType}^${triggerEvent}` !== 'ORU^R01') {
    throw new Hl7ParseError(`Unsupported message type: ${messageTypeField || '(missing MSH-9)'}`);
  }

  const pidFields = findSegment(segments, 'PID', fieldSep) ?? [];
  const patientIdentifierField = pidFields[3] ?? '';
  const patientNameField = pidFields[5] ?? '';
  const [patientFamilyName, patientGivenName] = patientNameField.split('^');

  const obrFields = findSegment(segments, 'OBR', fieldSep) ?? [];
  const universalServiceField = obrFields[4] ?? '';
  const [reportCode, reportDisplay, reportCodeSystem] = universalServiceField.split('^');

  const observations: ParsedOruObservation[] = findSegments(segments, 'OBX', fieldSep).map((fields) => {
    const observationIdField = fields[3] ?? '';
    const [code, display, codeSystem] = observationIdField.split('^');
    return {
      code: code || null,
      display: display || null,
      codeSystem: codeSystem || null,
      valueType: fields[2] || null,
      value: fields[5] || null,
      unit: fields[6] || null,
      abnormalFlag: fields[8] || null,
      resultStatus: fields[11] || null,
    };
  });

  if (observations.length === 0) {
    throw new Hl7ParseError('No OBX (observation) segments found');
  }

  return {
    messageControlId,
    messageType: `${messageType}^${triggerEvent}`,
    patientIdentifier: patientIdentifierField.split('^')[0] || null,
    patientFamilyName: patientFamilyName || null,
    patientGivenName: patientGivenName || null,
    placerOrderNumber: obrFields[2] || null,
    fillerOrderNumber: obrFields[3] || null,
    reportCodeSystem: reportCodeSystem || null,
    reportCode: reportCode || null,
    reportDisplay: reportDisplay || null,
    observations,
  };
}
