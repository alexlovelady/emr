export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
}

export interface SendSmsRequest {
  to: string;
  body: string;
}

export interface MakeCallRequest {
  to: string;
  /** Spoken verbatim (e.g. via a TwiML `<Say>`) — this is a one-way automated announcement, not a
   * live agent call. Keep it short and unambiguous read aloud by a text-to-speech voice. */
  message: string;
}

/**
 * EHR_BUILD_SPEC.md §26 Phase 8's "SMS/email notification adapter" — no real Twilio/SendGrid-style
 * vendor exists to integrate against yet, same adapter-interface-now pattern as every other vendor
 * boundary. Wired into exactly one trigger point this pass — a new secure message notifies the
 * other party (`@ehr/messaging`) — since every other domain that could reasonably notify (results
 * released, claim denied, etc.) already emits an outbox event a future notifier-worker can consume
 * without any interface change; see README's Phase 8 scope decisions.
 *
 * `makeCall` covers only a one-way automated announcement (an appointment-reminder call reading a
 * short message via text-to-speech) — deliberately NOT a live call-center/softphone capability
 * (agent-to-patient voice, conference transfer, etc.), which is a different product entirely and
 * out of scope here.
 */
export interface NotificationGateway {
  sendEmail(request: SendEmailRequest): Promise<void>;
  sendSms(request: SendSmsRequest): Promise<void>;
  makeCall(request: MakeCallRequest): Promise<void>;
}
