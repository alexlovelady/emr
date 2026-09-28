'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { AutoMatchResult, BankDepositRow, ImportBankStatementResult } from '@/lib/types';

export async function importBankStatement(rawText: string): Promise<ActionResult<ImportBankStatementResult>> {
  const result = await runAction(() =>
    callBackend<ImportBankStatementResult>('/api/v1/bank-deposits/import', { method: 'POST', body: { rawText } }),
  );
  if (result.ok) revalidatePath('/bank-reconciliation');
  return result;
}

export async function autoMatchDeposits(): Promise<ActionResult<AutoMatchResult>> {
  const result = await runAction(() => callBackend<AutoMatchResult>('/api/v1/bank-deposits/auto-match', { method: 'POST' }));
  if (result.ok) revalidatePath('/bank-reconciliation');
  return result;
}

export async function matchDepositManually(depositId: string, remittanceId: string): Promise<ActionResult<BankDepositRow>> {
  const result = await runAction(() =>
    callBackend<BankDepositRow>(`/api/v1/bank-deposits/${depositId}/match`, { method: 'POST', body: { remittanceId } }),
  );
  if (result.ok) revalidatePath('/bank-reconciliation');
  return result;
}

export async function ignoreDeposit(depositId: string, reason: string): Promise<ActionResult<BankDepositRow>> {
  const result = await runAction(() =>
    callBackend<BankDepositRow>(`/api/v1/bank-deposits/${depositId}/ignore`, { method: 'POST', body: { reason } }),
  );
  if (result.ok) revalidatePath('/bank-reconciliation');
  return result;
}
