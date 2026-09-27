import { describe, expect, it } from 'vitest';
import { RateLimitExceededError } from './ai-gateway.js';
import { NoopAiGateway } from './noop-ai-gateway.js';

describe('NoopAiGateway', () => {
  it('redacts SSN-like, phone, and email patterns', () => {
    const gateway = new NoopAiGateway();
    const redacted = gateway.redact('SSN 123-45-6789, call 555-123-4567 or email jane@example.com');
    expect(redacted).not.toContain('123-45-6789');
    expect(redacted).not.toContain('555-123-4567');
    expect(redacted).not.toContain('jane@example.com');
    expect(redacted).toContain('[redacted-ssn]');
    expect(redacted).toContain('[redacted-phone]');
    expect(redacted).toContain('[redacted-email]');
  });

  it('is never approved for PHI (no vendor BAA exists)', () => {
    expect(new NoopAiGateway().isApprovedForPhi()).toBe(false);
  });

  it('returns deterministic, reproducible output for identical input', async () => {
    const gateway = new NoopAiGateway();
    const request = {
      tenantId: 'tenant-1',
      promptTemplateId: 'chart-qa-v1' as const,
      context: [{ ref: 'Problem/1', data: { displayName: 'Type 2 diabetes' } }],
      input: 'What are the active problems?',
    };
    const first = await gateway.generate(request);
    const second = await gateway.generate({ ...request, tenantId: 'tenant-2' });
    expect(first.outputText).toBe(second.outputText);
    expect(first.outputHash).toBe(second.outputHash);
    expect(first.modelProvider).toBe('noop');
    expect(first.promptTemplateVersion).toBe('chart-qa-v1');
  });

  it('cites every context ref in the rendered output', async () => {
    const gateway = new NoopAiGateway();
    const result = await gateway.generate({
      tenantId: 'tenant-1',
      promptTemplateId: 'encounter-summary-v1',
      context: [
        { ref: 'Encounter/abc', data: {} },
        { ref: 'Observation/def', data: {} },
      ],
      input: 'summarize',
    });
    expect(result.outputText).toContain('Encounter/abc');
    expect(result.outputText).toContain('Observation/def');
  });

  it('returns a valid-shaped candidate cohort DSL only for nl-to-cohort-dsl-v1', async () => {
    const gateway = new NoopAiGateway();
    const cohortResult = await gateway.generate({
      tenantId: 'tenant-1',
      promptTemplateId: 'nl-to-cohort-dsl-v1',
      context: [],
      input: 'patients 45-75 with diabetes',
    });
    expect(cohortResult.outputJson).toMatchObject({ version: 1, entity: 'patient' });

    const otherResult = await gateway.generate({
      tenantId: 'tenant-1',
      promptTemplateId: 'task-summary-v1',
      context: [],
      input: 'summarize my tasks',
    });
    expect(otherResult.outputJson).toBeNull();
  });

  it('enforces a real per-tenant daily rate cap', async () => {
    const gateway = new NoopAiGateway(2);
    const request = { tenantId: 'tenant-limited', promptTemplateId: 'task-summary-v1' as const, context: [], input: 'x' };
    await gateway.generate(request);
    await gateway.generate(request);
    await expect(gateway.generate(request)).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('rate-limits per tenant independently', async () => {
    const gateway = new NoopAiGateway(1);
    await gateway.generate({ tenantId: 'tenant-a', promptTemplateId: 'task-summary-v1', context: [], input: 'x' });
    await expect(
      gateway.generate({ tenantId: 'tenant-b', promptTemplateId: 'task-summary-v1', context: [], input: 'x' }),
    ).resolves.toBeDefined();
  });
});
