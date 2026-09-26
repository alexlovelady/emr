import { z } from 'zod';

export const RequestUploadSchema = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(200),
});
export type RequestUploadInput = z.infer<typeof RequestUploadSchema>;
