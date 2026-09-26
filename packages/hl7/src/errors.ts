/** Thrown for any structurally invalid HL7 message — callers store the raw message regardless (see apps/interop-hl7). */
export class Hl7ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hl7ParseError';
  }
}
