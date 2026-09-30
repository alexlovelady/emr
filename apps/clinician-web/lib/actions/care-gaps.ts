'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { CareGapWorklistItem } from '@/lib/types';

export async function resolveCareGap(id: string): Promise<ActionResult<CareGapWorklistItem>> {
  const result = await runAction(() => callBackend<CareGapWorklistItem>(`/api/v1/care-gaps/${id}/resolve`, { method: 'POST' }));
  if (result.ok) revalidatePath('/care-gaps');
  return result;
}
