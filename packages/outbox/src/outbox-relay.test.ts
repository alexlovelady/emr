import { describe, expect, it, vi } from 'vitest';
import { OutboxRelay } from './outbox-relay.js';
import type { EventPublisher } from './domain-event.js';

describe('OutboxRelay.start', () => {
  it('does not crash the process when a tick rejects (e.g. DB temporarily unreachable)', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandledRejection = vi.fn();
    process.once('unhandledRejection', unhandledRejection);

    const failingDb = {
      selectFrom: () => {
        throw new Error('ECONNREFUSED');
      },
    } as never;
    const publisher: EventPublisher = { publish: vi.fn() };
    const relay = new OutboxRelay(failingDb, publisher, { pollIntervalMs: 10, batchSize: 10 });

    relay.start();
    await vi.advanceTimersByTimeAsync(10);
    relay.stop();

    // Give any stray unhandled rejection a turn of the microtask queue to surface.
    await Promise.resolve();

    expect(unhandledRejection).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[OutboxRelay] tick failed, will retry next interval:', expect.any(Error));

    errorSpy.mockRestore();
    vi.useRealTimers();
  });
});
