import { z } from 'zod';

export const CreateAppealSchema = z.object({
  appealReason: z.string().min(1).max(5000),
  /** Set when a coder drafted this with AI help (see `@ehr/ai`'s appeal-draft endpoint) and is
   * submitting it, with or without edits — same traceability pattern as charges'
   * `sourceAiGenerationId` (migration 0039). */
  sourceAiGenerationId: z.string().uuid().nullish(),
});
export type CreateAppealInput = z.infer<typeof CreateAppealSchema>;

export const DecideAppealSchema = z.object({
  outcome: z.enum(['won', 'lost']),
  decisionNotes: z.string().min(1).max(2000),
});
export type DecideAppealInput = z.infer<typeof DecideAppealSchema>;
