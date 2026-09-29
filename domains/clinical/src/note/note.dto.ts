import { z } from 'zod';

export const CreateNoteSchema = z.object({
  encounterId: z.string().uuid(),
  templateId: z.string().uuid().nullish(),
  noteType: z.string().min(1).max(200),
  content: z.record(z.string(), z.string()).nullish(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

/** Item 19's copy-forward creation path — see `NoteService.createFromPrior()`'s doc comment for
 * how this differs from `amend()`. */
export const CreateNoteFromPriorSchema = z.object({
  encounterId: z.string().uuid(),
  priorNoteId: z.string().uuid(),
  noteType: z.string().min(1).max(200),
});
export type CreateNoteFromPriorInput = z.infer<typeof CreateNoteFromPriorSchema>;

export const UpdateNoteContentSchema = z.object({
  content: z.record(z.string(), z.string()),
});
export type UpdateNoteContentInput = z.infer<typeof UpdateNoteContentSchema>;

export const VoidNoteSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type VoidNoteInput = z.infer<typeof VoidNoteSchema>;
