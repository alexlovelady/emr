/**
 * EHR_BUILD_SPEC.md §15.1's "one internal AI gateway" — every Phase 9 feature calls exactly this
 * interface, never a vendor SDK directly, so swapping in a real, BAA-covered LLM vendor later is a
 * one-class change (see `NoopAiGateway` and docs/adr/0004-deferred-ai-vendor.md).
 */
export type PromptTemplateId =
  | 'note-draft-v1'
  | 'encounter-summary-v1'
  | 'chart-qa-v1'
  | 'message-draft-v1'
  | 'coding-suggestion-v1'
  | 'denial-summary-v1'
  | 'appeal-draft-v1'
  | 'task-summary-v1'
  | 'nl-to-cohort-dsl-v1';

/**
 * One retrieved, already-minimum-necessary fact (§15.1's "minimum-necessary context assembly") —
 * `ref` becomes a §15.4 provenance object's `source_refs` entry verbatim, and `data` is never a raw
 * domain row, only the specific fields the prompt template needs.
 */
export interface AiContextItem {
  ref: string;
  data: Record<string, unknown>;
}

export interface AiGenerateRequest {
  tenantId: string;
  promptTemplateId: PromptTemplateId;
  context: AiContextItem[];
  input: string;
}

export interface AiGenerateResult {
  outputText: string;
  /** Populated only for `'nl-to-cohort-dsl-v1'` — the LLM's candidate cohort DSL JSON. */
  outputJson: Record<string, unknown> | null;
  modelProvider: string;
  modelId: string;
  modelVersion: string;
  promptTemplateVersion: string;
  outputHash: string;
  generatedAt: string;
}

export class RateLimitExceededError extends Error {}

export interface AiGateway {
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
  /** §15.1 redaction hook — scrubs likely-PHI-adjacent patterns before text would leave this process. */
  redact(text: string): string;
  /** §15.1's "approved model/vendor list" + "BAA/PHI eligibility enforcement" as a real, checkable gate. */
  isApprovedForPhi(): boolean;
}
