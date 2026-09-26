import { of, throwError, firstValueFrom } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

const recordAuditEvent = vi.fn().mockResolvedValue(undefined);
const getCurrentTransaction = vi.fn().mockReturnValue({});

vi.mock('@ehr/db', () => ({ getCurrentTransaction: (...args: unknown[]) => getCurrentTransaction(...args) }));
vi.mock('../audit-service.js', () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args),
}));

const { AuditInterceptor } = await import('./audit.interceptor.js');
const { AUDIT_METADATA_KEY, SKIP_AUDIT_METADATA_KEY } = await import('./audited.decorator.js');

function makeContext(opts: {
  metadata?: Record<string, unknown>;
  ehrContext?: Record<string, unknown>;
  params?: Record<string, string>;
}): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    get: (key: string) => {
      if (key === AUDIT_METADATA_KEY) return opts.metadata?.[AUDIT_METADATA_KEY];
      if (key === SKIP_AUDIT_METADATA_KEY) return opts.metadata?.[SKIP_AUDIT_METADATA_KEY];
      return undefined;
    },
  } as unknown as Reflector;

  const context = {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => ({ name: 'TestController' }),
    switchToHttp: () => ({
      getRequest: () => ({ ehrContext: opts.ehrContext, params: opts.params }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('AuditInterceptor', () => {
  beforeEach(() => {
    recordAuditEvent.mockClear();
    getCurrentTransaction.mockClear();
  });

  it('records a success audit event and passes the result through', async () => {
    const { context, reflector } = makeContext({
      metadata: { [AUDIT_METADATA_KEY]: { action: 'location.create', resourceType: 'Location' } },
      ehrContext: { tenantId: 't1', requestId: 'r1', actor: { id: 'u1', type: 'user' } },
    });
    const interceptor = new AuditInterceptor(reflector);
    const next: CallHandler = { handle: () => of({ id: 'loc-1', name: 'Main Office' }) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ id: 'loc-1', name: 'Main Office' });
    expect(recordAuditEvent).toHaveBeenCalledOnce();
    const [, envelope] = recordAuditEvent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(envelope).toMatchObject({
      tenantId: 't1',
      action: 'location.create',
      outcome: 'success',
      resource: { type: 'Location', id: 'loc-1' },
    });
  });

  it('records a failure audit event and rethrows', async () => {
    const { context, reflector } = makeContext({
      metadata: { [AUDIT_METADATA_KEY]: { action: 'location.create', resourceType: 'Location' } },
      ehrContext: { tenantId: 't1', requestId: 'r1' },
      params: { id: 'loc-1' },
    });
    const interceptor = new AuditInterceptor(reflector);
    const boom = new Error('boom');
    const next: CallHandler = { handle: () => throwError(() => boom) };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBe(boom);
    expect(recordAuditEvent).toHaveBeenCalledOnce();
    const [, envelope] = recordAuditEvent.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(envelope).toMatchObject({ outcome: 'failure', resource: { type: 'Location', id: 'loc-1' } });
  });

  it('skips auditing entirely when @SkipAudit is set', async () => {
    const { context, reflector } = makeContext({ metadata: { [SKIP_AUDIT_METADATA_KEY]: true } });
    const interceptor = new AuditInterceptor(reflector);
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('ok');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
