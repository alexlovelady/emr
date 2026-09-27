import { Hl7ParseError } from './errors.js';
import { splitSegments, parseMsh, findSegment } from './segment-utils.js';

export interface ParsedOrmMessage {
  messageControlId: string;
  messageType: string;
  /** PV1-19 (visit number) — this system's own encounter UUID, same correlation convention as
   * `oru-r01.ts`'s placer-order-number / `adt.ts`'s patient identifier. */
  encounterId: string | null;
  /** OBR-16 (ordering provider), first component — this system's own practitioner UUID. */
  orderingPractitionerId: string | null;
  codeSystem: string | null;
  code: string | null;
  displayName: string | null;
}

/**
 * A real-but-minimal ORM parser covering exactly one message type/trigger: `ORM^O01` (new order).
 * Only OBR-4 (universal service ID) is read for the ordered test/service — priority (real HL7
 * packs it into a Timing/Quantity structure) is deliberately not parsed; `apps/interop-hl7` lets
 * `CreateOrderSchema`'s own `routine` default apply instead of half-implementing TQ1 parsing for a
 * field this system has no other use for yet.
 */
export function parseOrmMessage(raw: string): ParsedOrmMessage {
  const segments = splitSegments(raw);
  const { fieldSep, messageType, triggerEvent, messageTypeField, messageControlId } = parseMsh(segments);
  if (`${messageType}^${triggerEvent}` !== 'ORM^O01') {
    throw new Hl7ParseError(`Unsupported message type: ${messageTypeField || '(missing MSH-9)'}`);
  }

  const pv1Fields = findSegment(segments, 'PV1', fieldSep) ?? [];

  const obrFields = findSegment(segments, 'OBR', fieldSep);
  if (!obrFields) throw new Hl7ParseError('Missing OBR segment');
  const universalServiceField = obrFields[4] ?? '';
  const [code, displayName, codeSystem] = universalServiceField.split('^');
  const orderingProviderField = obrFields[16] ?? '';

  return {
    messageControlId,
    messageType: `${messageType}^${triggerEvent}`,
    encounterId: pv1Fields[19] || null,
    orderingPractitionerId: orderingProviderField.split('^')[0] || null,
    codeSystem: codeSystem || null,
    code: code || null,
    displayName: displayName || null,
  };
}
