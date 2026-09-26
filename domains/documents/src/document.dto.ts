import { z } from 'zod';

export const RequestUploadSchema = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(200),
  patientId: z.string().uuid().nullish(),
  encounterId: z.string().uuid().nullish(),
  documentCategory: z.string().max(100).nullish(),
});
export type RequestUploadInput = z.infer<typeof RequestUploadSchema>;
