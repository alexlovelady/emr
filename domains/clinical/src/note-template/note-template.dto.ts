import { z } from 'zod';

export const NoteTemplateSectionSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  defaultText: z.string().max(4000).nullish(),
});

export const CreateNoteTemplateSchema = z.object({
  name: z.string().min(1).max(300),
  sections: z.array(NoteTemplateSectionSchema).min(1),
});
export type CreateNoteTemplateInput = z.infer<typeof CreateNoteTemplateSchema>;
