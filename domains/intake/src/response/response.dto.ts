import { z } from 'zod';

export const CreateIntakeFormResponseSchema = z.object({
  templateId: z.string().uuid(),
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().nullish(),
});
export type CreateIntakeFormResponseInput = z.infer<typeof CreateIntakeFormResponseSchema>;

export const SubmitIntakeFormResponseSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});
export type SubmitIntakeFormResponseInput = z.infer<typeof SubmitIntakeFormResponseSchema>;
