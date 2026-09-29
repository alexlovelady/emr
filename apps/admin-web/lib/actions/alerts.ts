'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { AlertRow } from '@/lib/types';

export async function resolveAlert(id: string): Promise<ActionResult<AlertRow>> {
  const result = await runAction(() => callBackend<AlertRow>(`/api/v1/alerts/${id}/resolve`, { method: 'POST' }));
  if (result.ok) revalidatePath('/alerts');
  return result;
}
