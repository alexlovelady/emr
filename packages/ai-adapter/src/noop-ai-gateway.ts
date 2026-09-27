import { createHash } from 'node:crypto';
import type { AiContextItem, AiGateway, AiGenerateRequest, AiGenerateResult, PromptTemplateId } from './ai-gateway.js';
import { RateLimitExceededError } from './ai-gateway.js';

const TEMPLATE_LABELS: Record<PromptTemplateId, string> = {
  'note-draft-v1': 'Ambient note draft',
  'encounter-summary-v1': 'Encounter summary',
  'chart-qa-v1': 'Chart Q&A answer',
  'message-draft-v1': 'Patient-message reply draft',
  'coding-suggestion-v1': 'Coding suggestions',
  'denial-summary-v1': 'Denial explanation',
  'task-summary-v1': 'Task summary',
  'nl-to-cohort-dsl-v1': 'Cohort DSL candidate',
};

/** A fixed, always-valid candidate matching @ehr/query's CohortDslSchema shape (not re-imported here — packages/ai-adapter has no domain dependencies, by design). */
const CANNED_COHORT_DSL = {
  version: 1,
  entity: 'patient',
  where: {
    all: [
      { field: 'age', op: 'between', value: [45, 75] },
      { concept: 'condition', system: 'icd10', op: 'active', value: 'E11' },
    ],
  },
};

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_PATTERN = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g;

/**
 * No LLM vendor BAA exists in this environment (regulatory manual §16.1) — see
 * docs/adr/0004-deferred-ai-vendor.md. Every "generation" is a deterministic, templated stub (no
 * network call, no real language understanding) that still exercises the full real pipeline around
 * it: redaction, prompt-template versioning, model/version capture, a real per-tenant daily rate
 * cap, and reproducible output hashing.
 */
export class NoopAiGateway implements AiGateway {
  private readonly dailyCounts = new Map<string, { date: string; count: number }>();

  constructor(private readonly dailyLimitPerTenant = 200) {}

  redact(text: string): string {
    return text.replace(SSN_PATTERN, '[redacted-ssn]').replace(PHONE_PATTERN, '[redacted-phone]').replace(EMAIL_PATTERN, '[redacted-email]');
  }

  isApprovedForPhi(): boolean {
    return false;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    this.checkRateLimit(request.tenantId);

    const redactedInput = this.redact(request.input);
    const redactedContext = request.context.map((item) => redactContextItem(item, this));

    const outputText = this.renderOutputText(request.promptTemplateId, redactedInput, redactedContext);
    const outputJson = request.promptTemplateId === 'nl-to-cohort-dsl-v1' ? CANNED_COHORT_DSL : null;
    const generatedAt = new Date().toISOString();

    return {
      outputText,
      outputJson,
      modelProvider: 'noop',
      modelId: 'noop-deterministic-stub',
      modelVersion: '1.0.0',
      promptTemplateVersion: request.promptTemplateId,
      outputHash: createHash('sha256').update(outputText).digest('hex'),
      generatedAt,
    };
  }

  private checkRateLimit(tenantId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.dailyCounts.get(tenantId);
    if (!existing || existing.date !== today) {
      this.dailyCounts.set(tenantId, { date: today, count: 1 });
      return;
    }
    if (existing.count >= this.dailyLimitPerTenant) {
      throw new RateLimitExceededError(`Tenant has reached its daily AI generation limit (${this.dailyLimitPerTenant})`);
    }
    existing.count += 1;
  }

  private renderOutputText(promptTemplateId: PromptTemplateId, input: string, context: AiContextItem[]): string {
    const label = TEMPLATE_LABELS[promptTemplateId];
    const refs = context.map((item) => item.ref).join(', ') || '(no grounding context)';
    const inputHash = createHash('sha256').update(input).digest('hex').slice(0, 12);
    return (
      `[${label} — deterministic stub, not a real model response]\n` +
      `Grounded on: ${refs}\n` +
      `Input digest: ${inputHash}\n` +
      `This is placeholder output from NoopAiGateway (no LLM vendor BAA exists yet — see ` +
      `docs/adr/0004-deferred-ai-vendor.md). A human must review and accept, edit, or reject this ` +
      `before it is used anywhere.`
    );
  }
}

function redactContextItem(item: AiContextItem, gateway: NoopAiGateway): AiContextItem {
  const redactedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item.data)) {
    redactedData[key] = typeof value === 'string' ? gateway.redact(value) : value;
  }
  return { ref: item.ref, data: redactedData };
}
