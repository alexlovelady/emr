import { describe, expect, it, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import type { NotificationGateway } from '@ehr/notification-adapter';
import { AlertEvaluator } from './alert-evaluator.js';
import type { AlertRepository } from './alert.repository.js';
import type { AlertFinding, AlertRow, AlertRule } from './alert.types.js';

function fakeRow(finding: AlertFinding): AlertRow {
  return {
    id: 'row-id',
    ruleKey: finding.ruleKey,
    dedupeKey: finding.dedupeKey,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
    status: 'open',
    tenantId: finding.tenantId ?? null,
    openedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    updatedAt: new Date(),
  };
}

describe('AlertEvaluator', () => {
  it('upserts an open alert for each finding and sends a notification only for a newly-opened one', async () => {
    const finding: AlertFinding = { ruleKey: 'r1', dedupeKey: 'd1', severity: 'critical', title: 'Something broke', detail: { x: 1 } };
    const rule: AlertRule = { key: 'r1', description: 'test rule', evaluate: vi.fn().mockResolvedValue([finding]) };

    const upsertOpen = vi.fn().mockResolvedValue({ alert: fakeRow(finding), isNew: true });
    const resolveStale = vi.fn().mockResolvedValue(undefined);
    const alertRepo = { upsertOpen, resolveStale } as unknown as AlertRepository;

    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const gateway: NotificationGateway = { sendEmail, sendSms: vi.fn(), makeCall: vi.fn() };

    const evaluator = new AlertEvaluator({} as Kysely<DB>, [rule], gateway, alertRepo, { notifyEmail: 'ops@example.test' });
    await evaluator.evaluate();

    expect(upsertOpen).toHaveBeenCalledWith(expect.anything(), finding);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: 'ops@example.test', subject: expect.stringContaining('Something broke') });
    expect(resolveStale).toHaveBeenCalledWith(expect.anything(), 'r1', ['d1']);
  });

  it('does not notify again for a finding that was already open', async () => {
    const finding: AlertFinding = { ruleKey: 'r1', dedupeKey: 'd1', severity: 'warning', title: 'Still ongoing', detail: {} };
    const rule: AlertRule = { key: 'r1', description: 'test rule', evaluate: vi.fn().mockResolvedValue([finding]) };

    const alertRepo = {
      upsertOpen: vi.fn().mockResolvedValue({ alert: fakeRow(finding), isNew: false }),
      resolveStale: vi.fn().mockResolvedValue(undefined),
    } as unknown as AlertRepository;
    const sendEmail = vi.fn();
    const gateway: NotificationGateway = { sendEmail, sendSms: vi.fn(), makeCall: vi.fn() };

    const evaluator = new AlertEvaluator({} as Kysely<DB>, [rule], gateway, alertRepo, { notifyEmail: 'ops@example.test' });
    await evaluator.evaluate();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('never sends a notification when notifyEmail is not configured', async () => {
    const finding: AlertFinding = { ruleKey: 'r1', dedupeKey: 'd1', severity: 'info', title: 'FYI', detail: {} };
    const rule: AlertRule = { key: 'r1', description: 'test rule', evaluate: vi.fn().mockResolvedValue([finding]) };
    const alertRepo = {
      upsertOpen: vi.fn().mockResolvedValue({ alert: fakeRow(finding), isNew: true }),
      resolveStale: vi.fn().mockResolvedValue(undefined),
    } as unknown as AlertRepository;
    const sendEmail = vi.fn();
    const gateway: NotificationGateway = { sendEmail, sendSms: vi.fn(), makeCall: vi.fn() };

    const evaluator = new AlertEvaluator({} as Kysely<DB>, [rule], gateway, alertRepo);
    await evaluator.evaluate();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('a rule that throws is logged and skipped, without stopping the other rules', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingRule: AlertRule = { key: 'broken', description: 'throws', evaluate: vi.fn().mockRejectedValue(new Error('boom')) };
    const finding: AlertFinding = { ruleKey: 'ok', dedupeKey: 'd1', severity: 'info', title: 'fine', detail: {} };
    const okRule: AlertRule = { key: 'ok', description: 'fine', evaluate: vi.fn().mockResolvedValue([finding]) };

    const upsertOpen = vi.fn().mockResolvedValue({ alert: fakeRow(finding), isNew: true });
    const alertRepo = { upsertOpen, resolveStale: vi.fn().mockResolvedValue(undefined) } as unknown as AlertRepository;
    const gateway: NotificationGateway = { sendEmail: vi.fn(), sendSms: vi.fn(), makeCall: vi.fn() };

    const evaluator = new AlertEvaluator({} as Kysely<DB>, [failingRule, okRule], gateway, alertRepo);
    await evaluator.evaluate();

    expect(errorSpy).toHaveBeenCalled();
    expect(upsertOpen).toHaveBeenCalledWith(expect.anything(), finding);

    errorSpy.mockRestore();
  });

  it('a failed notification send does not prevent resolveStale from running', async () => {
    const finding: AlertFinding = { ruleKey: 'r1', dedupeKey: 'd1', severity: 'critical', title: 'Broke', detail: {} };
    const rule: AlertRule = { key: 'r1', description: 'test', evaluate: vi.fn().mockResolvedValue([finding]) };
    const resolveStale = vi.fn().mockResolvedValue(undefined);
    const alertRepo = {
      upsertOpen: vi.fn().mockResolvedValue({ alert: fakeRow(finding), isNew: true }),
      resolveStale,
    } as unknown as AlertRepository;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway: NotificationGateway = { sendEmail: vi.fn().mockRejectedValue(new Error('smtp down')), sendSms: vi.fn(), makeCall: vi.fn() };

    const evaluator = new AlertEvaluator({} as Kysely<DB>, [rule], gateway, alertRepo, { notifyEmail: 'ops@example.test' });
    await evaluator.evaluate();

    expect(resolveStale).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
