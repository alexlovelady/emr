import { describe, expect, it } from 'vitest';
import { NoopNotificationGateway } from './noop-notification-gateway.js';

describe('NoopNotificationGateway', () => {
  it('resolves sendEmail without throwing', async () => {
    const gateway = new NoopNotificationGateway();
    await expect(
      gateway.sendEmail({ to: 'patient@example.com', subject: 'New message', body: 'You have a new secure message.' }),
    ).resolves.toBeUndefined();
  });

  it('resolves sendSms without throwing', async () => {
    const gateway = new NoopNotificationGateway();
    await expect(gateway.sendSms({ to: '+15555550100', body: 'You have a new secure message.' })).resolves.toBeUndefined();
  });
});
