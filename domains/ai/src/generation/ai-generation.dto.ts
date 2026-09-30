import { z } from 'zod';
import type { PromptTemplateId } from '@ehr/ai-adapter';

/** One retrieved, minimum-necessary fact — fed straight to `AiGateway.generate()`. */
export interface AiContextItemInput {
  ref: string;
  data: Record<string, unknown>;
}

/** Internal — built by each feature controller from its own request, not a Zod body schema itself. */
export interface ProposeAiGenerationInput {
  feature: string;
  promptTemplateId: PromptTemplateId;
  patientId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  inputText: string;
  context: AiContextItemInput[];
  /** `lab_result_explanation` only — unlike `linked_cohort_execution_id` (set after the fact via
   * `acceptWithLinkedCohortExecution`, since that execution doesn't exist until accept time), the
   * diagnostic report already exists before this generation does, so it's set directly at propose
   * time here. */
  linkedDiagnosticReportId?: string;
}

export const AcceptAiGenerationSchema = z.object({
  editedOutputText: z.string().min(1).max(20_000).nullish(),
});
export type AcceptAiGenerationInput = z.infer<typeof AcceptAiGenerationSchema>;

/** EHR_BUILD_SPEC.md §15.4's exact provenance object shape. */
export interface AiProvenance {
  model_provider: string;
  model_id: string;
  model_version: string;
  prompt_template_version: string;
  source_refs: string[];
  generated_at: string;
  output_hash: string;
  reviewer_id: string | null;
  decision: 'pending' | 'accepted' | 'accepted_with_edits' | 'rejected';
}
