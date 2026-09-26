import type { NotificationGateway, SendEmailRequest, SendSmsRequest } from './notification-gateway.js';

/** No real SMS/email vendor exists in this environment — every send is logged, not transmitted. */
export class NoopNotificationGateway implements NotificationGateway {
  async sendEmail(request: SendEmailRequest): Promise<void> {
    console.warn('[NoopNotificationGateway] email', { to: request.to, subject: request.subject });
  }

  async sendSms(request: SendSmsRequest): Promise<void> {
    console.warn('[NoopNotificationGateway] sms', { to: request.to, length: request.body.length });
  }
}
