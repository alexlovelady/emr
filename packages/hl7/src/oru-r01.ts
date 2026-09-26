import { Hl7ParseError } from './errors.js';

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
 * (unsolicited result). EHR_BUILD_SPEC.md §26 Phase 4 only needs lab-result ingestion; ADT, SIU,
 * ORM, and MDM are explicitly deferred ("... where needed ... as needed" per spec §12).
 *
 * Segments are split on CR (`\r`) per the HL7 standard, with LF (`\n`) accepted too so
 * hand-written test fixtures don't need literal carriage returns. Component (`^`) and repetition
 * (`~`) separators are read from MSH-2 rather than hardcoded, though only the standard `^~\&` set
 * is actually exercised here.
 */
export function parseOruR01(raw: string): ParsedOruMessage {
  const segments = raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const msh = segments.find((s) => s.startsWith('MSH'));
  if (!msh) throw new Hl7ParseError('Missing MSH segment');

  const fieldSep = msh.charAt(3);
  const mshFields = msh.split(fieldSep);
  // MSH-1 is the field separator itself, so MSH-2 (encoding chars) is mshFields[1], and every
  // subsequent field index N corresponds to mshFields[N] (not N-1) purely for MSH; every other
  // segment type's field N is at index N (segment name occupies index 0).
  const messageTypeField = mshFields[8] ?? '';
  const [messageType, triggerEvent] = messageTypeField.split('^');
  if (`${messageType}^${triggerEvent}` !== 'ORU^R01') {
    throw new Hl7ParseError(`Unsupported message type: ${messageTypeField || '(missing MSH-9)'}`);
  }
  const messageControlId = mshFields[9];
  if (!messageControlId) throw new Hl7ParseError('Missing MSH-10 (message control ID)');

  const pid = segments.find((s) => s.startsWith('PID' + fieldSep));
  const pidFields = pid ? pid.split(fieldSep) : [];
  const patientIdentifierField = pidFields[3] ?? '';
  const patientNameField = pidFields[5] ?? '';
  const [patientFamilyName, patientGivenName] = patientNameField.split('^');

  const obr = segments.find((s) => s.startsWith('OBR' + fieldSep));
  const obrFields = obr ? obr.split(fieldSep) : [];
  const universalServiceField = obrFields[4] ?? '';
  const [reportCode, reportDisplay, reportCodeSystem] = universalServiceField.split('^');

  const observations: ParsedOruObservation[] = segments
    .filter((s) => s.startsWith('OBX' + fieldSep))
    .map((obx) => {
      const fields = obx.split(fieldSep);
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
