'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { LocationRow } from '@/lib/types';

export async function createLocation(organizationId: string, name: string, timeZone: string): Promise<ActionResult<LocationRow>> {
  const result = await runAction(() =>
    callBackend<LocationRow>('/api/v1/locations', {
      method: 'POST',
      body: { organizationId, name, timeZone: timeZone.trim() || undefined },
    }),
  );
  if (result.ok) revalidatePath('/locations');
  return result;
}
