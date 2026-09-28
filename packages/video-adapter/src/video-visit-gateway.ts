export interface CreateVideoVisitRequest {
  appointmentId: string;
}

export interface CreateVideoVisitResult {
  /** The identifier a real vendor (Twilio Video, Daily.co, ...) would assign to the room/session. */
  providerVisitId: string;
  /** Host-role link — only ever surfaced to staff, never to the patient portal. */
  practitionerJoinUrl: string;
  /** Participant-role link — the only one the patient portal surfaces. */
  patientJoinUrl: string;
}

/**
 * Same "buy, not built" vendor boundary as `LabOrderGateway`/`ClearinghouseGateway`: no real video
 * vendor is integrated. `NoopVideoVisitGateway` is the only implementation — it never establishes a
 * real audio/video session, it only mints a stable pair of links so the rest of the system (booking,
 * both UIs) can be built and tested against a real interface shape today.
 */
export interface VideoVisitGateway {
  createVisit(request: CreateVideoVisitRequest): Promise<CreateVideoVisitResult>;
}
