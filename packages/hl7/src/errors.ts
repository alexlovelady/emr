/** Thrown for any structurally invalid HL7 message — callers store the raw message regardless (see apps/interop-hl7). */
export class Hl7ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hl7ParseError';
  }
}

/**
 * Thrown for a message that is well-formed HL7 but cannot be correlated/applied to this tenant's
 * data — a missing required field, or no matching order/patient/appointment/encounter. Retrying
 * the exact same bytes later will not change the outcome (the message itself would need to be
 * resent with corrected data, which arrives as a genuinely new message), so `apps/interop-hl7`'s
 * retry relay (see `Hl7RetryRelay`) treats this as terminal — dead-lettered on first failure,
 * never auto-retried. Any OTHER thrown error (an unexpected exception, most plausibly a transient
 * database/connectivity failure) is treated as retryable by default — see that class's own doc
 * comment for the reasoning.
 */
export class Hl7PermanentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Hl7PermanentProcessingError';
  }
}
