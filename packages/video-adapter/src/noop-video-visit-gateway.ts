import type { CreateVideoVisitRequest, CreateVideoVisitResult, VideoVisitGateway } from './video-visit-gateway.js';

/**
 * No real video vendor (Twilio Video, Daily.co, ...) is connected in this environment. This never
 * establishes an actual video session — it mints a deterministic pair of placeholder links keyed by
 * the appointment id, purely so booking/UI code has something real to store and render. A real
 * implementation would call out to the vendor's room-creation API and return its actual join URLs.
 */
export class NoopVideoVisitGateway implements VideoVisitGateway {
  async createVisit(request: CreateVideoVisitRequest): Promise<CreateVideoVisitResult> {
    return {
      providerVisitId: request.appointmentId,
      practitionerJoinUrl: `https://video.ehr.internal/room/${request.appointmentId}?role=host`,
      patientJoinUrl: `https://video.ehr.internal/room/${request.appointmentId}?role=participant`,
    };
  }
}
