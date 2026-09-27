'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Denial } from '@/lib/types';

export async function resolveDenial(id: string, patientId: string, resolutionNotes: string): Promise<ActionResult<Denial>> {
  const result = await runAction(() =>
    callBackend<Denial>(`/api/v1/denials/${id}/resolve`, { method: 'POST', body: { resolutionNotes } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
