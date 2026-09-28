'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { ResourceRow } from '@/lib/types';

export async function createResource(locationId: string, name: string, resourceType: string): Promise<ActionResult<ResourceRow>> {
  const result = await runAction(() =>
    callBackend<ResourceRow>('/api/v1/resources', {
      method: 'POST',
      body: { locationId, name, resourceType },
    }),
  );
  if (result.ok) revalidatePath('/resources');
  return result;
}
