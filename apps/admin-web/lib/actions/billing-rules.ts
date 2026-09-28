'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { BillingRuleRow, BillingRuleType } from '@/lib/types';

export type CreateBillingRuleInput =
  | { ruleType: 'code_requires_diagnosis_prefix'; description: string; parameters: { code: string; diagnosisPrefix: string } }
  | { ruleType: 'code_forbidden_for_sex'; description: string; parameters: { code: string; sex: 'M' | 'F' } }
  | { ruleType: 'code_max_units'; description: string; parameters: { code: string; maxUnits: number } };

export async function createBillingRule(input: CreateBillingRuleInput): Promise<ActionResult<BillingRuleRow>> {
  const result = await runAction(() => callBackend<BillingRuleRow>('/api/v1/billing-rules', { method: 'POST', body: input }));
  if (result.ok) revalidatePath('/billing-rules');
  return result;
}

export async function updateBillingRuleStatus(id: string, status: 'active' | 'inactive'): Promise<ActionResult<BillingRuleRow>> {
  const result = await runAction(() =>
    callBackend<BillingRuleRow>(`/api/v1/billing-rules/${id}/status`, { method: 'POST', body: { status } }),
  );
  if (result.ok) revalidatePath('/billing-rules');
  return result;
}

export type { BillingRuleType };
