import { z } from 'zod';

export const IntakeFormFieldSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  type: z.enum(['text', 'textarea', 'number', 'boolean', 'date', 'select']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});

export const CreateIntakeFormTemplateSchema = z.object({
  name: z.string().min(1).max(300),
  schema: z.array(IntakeFormFieldSchema).min(1),
});
export type CreateIntakeFormTemplateInput = z.infer<typeof CreateIntakeFormTemplateSchema>;
