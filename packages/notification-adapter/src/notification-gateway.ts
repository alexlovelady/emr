export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
}

export interface SendSmsRequest {
  to: string;
  body: string;
}

/**
 * EHR_BUILD_SPEC.md §26 Phase 8's "SMS/email notification adapter" — no real Twilio/SendGrid-style
 * vendor exists to integrate against yet, same adapter-interface-now pattern as every other vendor
 * boundary. Wired into exactly one trigger point this pass — a new secure message notifies the
 * other party (`@ehr/messaging`) — since every other domain that could reasonably notify (results
 * released, claim denied, etc.) already emits an outbox event a future notifier-worker can consume
 * without any interface change; see README's Phase 8 scope decisions.
 */
export interface NotificationGateway {
  sendEmail(request: SendEmailRequest): Promise<void>;
  sendSms(request: SendSmsRequest): Promise<void>;
}
