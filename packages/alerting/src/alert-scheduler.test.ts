import { describe, expect, it, vi } from 'vitest';
import { AlertScheduler } from './alert-scheduler.js';
import type { AlertEvaluator } from './alert-evaluator.js';

describe('AlertScheduler', () => {
  it('evaluates once immediately on start(), then again each interval', async () => {
    vi.useFakeTimers();
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const evaluator = { evaluate } as unknown as AlertEvaluator;
    const scheduler = new AlertScheduler(evaluator, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    expect(evaluate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(evaluate).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(evaluate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('does not crash the process when evaluate() rejects outright', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandledRejection = vi.fn();
    process.once('unhandledRejection', unhandledRejection);

    const evaluate = vi.fn().mockRejectedValue(new Error('unexpected'));
    const evaluator = { evaluate } as unknown as AlertEvaluator;
    const scheduler = new AlertScheduler(evaluator, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    scheduler.stop();

    expect(unhandledRejection).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('skips an overlapping tick while an evaluation is still in flight', async () => {
    vi.useFakeTimers();
    let resolveEvaluate: (() => void) | undefined;
    const evaluate = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEvaluate = resolve;
        }),
    );
    const evaluator = { evaluate } as unknown as AlertEvaluator;
    const scheduler = new AlertScheduler(evaluator, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    expect(evaluate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(evaluate).toHaveBeenCalledTimes(1);

    resolveEvaluate?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(evaluate).toHaveBeenCalledTimes(2);

    scheduler.stop();
    vi.useRealTimers();
  });
});
