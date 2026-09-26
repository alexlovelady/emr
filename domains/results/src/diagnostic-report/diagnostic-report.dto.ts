import { z } from 'zod';

export const ResultValueSchema = z
  .object({
    code: z.string().min(1).max(100),
    display: z.string().min(1).max(300),
    valueQuantity: z.number().nullish(),
    valueText: z.string().max(1000).nullish(),
    unit: z.string().max(50).nullish(),
  })
  .refine((v) => v.valueQuantity != null || v.valueText != null, {
    message: 'Either valueQuantity or valueText must be provided',
  });

export const CreateDiagnosticReportSchema = z.object({
  encounterId: z.string().uuid(),
  orderId: z.string().uuid().nullish(),
  codeSystem: z.string().max(50).nullish(),
  code: z.string().max(50).nullish(),
  displayName: z.string().min(1).max(300),
  conclusion: z.string().max(2000).nullish(),
  performingLab: z.string().max(300).nullish(),
  criticalFlag: z.boolean().default(false),
  abnormalFlag: z.boolean().default(false),
  results: z.array(ResultValueSchema).min(1),
});
export type CreateDiagnosticReportInput = z.infer<typeof CreateDiagnosticReportSchema>;

export const ReviewDiagnosticReportSchema = z.object({
  reviewStatus: z.enum(['reviewed', 'acknowledged']),
});
export type ReviewDiagnosticReportInput = z.infer<typeof ReviewDiagnosticReportSchema>;
