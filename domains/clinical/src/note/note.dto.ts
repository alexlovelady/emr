import { z } from 'zod';

export const CreateNoteSchema = z.object({
  encounterId: z.string().uuid(),
  templateId: z.string().uuid().nullish(),
  noteType: z.string().min(1).max(200),
  content: z.record(z.string(), z.string()).nullish(),
});
export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteContentSchema = z.object({
  content: z.record(z.string(), z.string()),
});
export type UpdateNoteContentInput = z.infer<typeof UpdateNoteContentSchema>;

export const VoidNoteSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type VoidNoteInput = z.infer<typeof VoidNoteSchema>;
