import { of, firstValueFrom } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

const getCurrentTransaction = vi.fn().mockReturnValue({});
vi.mock('@ehr/db', () => ({ getCurrentTransaction: (...args: unknown[]) => getCurrentTransaction(...args) }));

const { AuthzInterceptor } = await import('./authz.interceptor.js');
const { REQUIRE_PERMISSION_METADATA_KEY, SKIP_AUTHZ_METADATA_KEY } = await import(
  './require-permission.decorator.js'
);
const { ForbiddenError } = await import('@ehr/domain-common');

function makeContext(opts: { metadata?: Record<string, unknown>; ehrContext?: Record<string, unknown> }): {
  context: ExecutionContext;
  reflector: Reflector;
} {
  const reflector = {
    get: (key: string) => opts.metadata?.[key],
  } as unknown as Reflector;

  const context = {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => ({ name: 'TestController' }),
    switchToHttp: () => ({ getRequest: () => ({ ehrContext: opts.ehrContext, params: {} }) }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('AuthzInterceptor', () => {
  beforeEach(() => getCurrentTransaction.mockClear());

  it('calls the handler when the policy engine allows', async () => {
    const { context, reflector } = makeContext({
      metadata: { [REQUIRE_PERMISSION_METADATA_KEY]: 'location.manage' },
      ehrContext: { tenantId: 't1', requestId: 'r1', actor: { id: 'u1', type: 'user' } },
    });
    const policyEngine = { authorize: vi.fn().mockResolvedValue({ allowed: true }) };
    const interceptor = new AuthzInterceptor(reflector, policyEngine as never);
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('ok');
    expect(policyEngine.authorize).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError and never calls the handler when denied', async () => {
    const { context, reflector } = makeContext({
      metadata: { [REQUIRE_PERMISSION_METADATA_KEY]: 'location.manage' },
      ehrContext: { tenantId: 't1', requestId: 'r1', actor: { id: 'u1', type: 'user' } },
    });
    const policyEngine = { authorize: vi.fn().mockResolvedValue({ allowed: false, deniedBy: 'role-permission' }) };
    const interceptor = new AuthzInterceptor(reflector, policyEngine as never);
    const handle = vi.fn(() => of('should-not-run'));
    const next: CallHandler = { handle };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBeInstanceOf(ForbiddenError);
    expect(handle).not.toHaveBeenCalled();
  });

  it('skips the check entirely when @SkipAuthz is set', async () => {
    const { context, reflector } = makeContext({ metadata: { [SKIP_AUTHZ_METADATA_KEY]: true } });
    const policyEngine = { authorize: vi.fn() };
    const interceptor = new AuthzInterceptor(reflector, policyEngine as never);
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('ok');
    expect(policyEngine.authorize).not.toHaveBeenCalled();
  });

  it('denies with no authenticated actor even if a permission is declared', async () => {
    const { context, reflector } = makeContext({
      metadata: { [REQUIRE_PERMISSION_METADATA_KEY]: 'location.manage' },
    });
    const policyEngine = { authorize: vi.fn() };
    const interceptor = new AuthzInterceptor(reflector, policyEngine as never);
    const next: CallHandler = { handle: () => of('should-not-run') };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBeInstanceOf(ForbiddenError);
    expect(policyEngine.authorize).not.toHaveBeenCalled();
  });
});
