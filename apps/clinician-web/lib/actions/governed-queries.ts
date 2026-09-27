'use server';

import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';

export async function executeGovernedQuery(name: string, params: Record<string, unknown>): Promise<ActionResult<unknown>> {
  return runAction(() => callBackend<unknown>(`/api/v1/governed-queries/${name}/execute`, { method: 'POST', body: params }));
}
