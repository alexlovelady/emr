import { z } from 'zod';

export const ImportBankStatementSchema = z.object({
  rawText: z.string().min(1),
});
export type ImportBankStatementInput = z.infer<typeof ImportBankStatementSchema>;

export const MatchDepositSchema = z.object({
  remittanceId: z.string().uuid(),
});
export type MatchDepositInput = z.infer<typeof MatchDepositSchema>;

export const IgnoreDepositSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type IgnoreDepositInput = z.infer<typeof IgnoreDepositSchema>;
