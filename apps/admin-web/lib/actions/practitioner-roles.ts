'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PractitionerRoleRow } from '@/lib/types';

export async function assignPractitionerLocationRole(
  practitionerId: string,
  locationId: string,
  roleId: string,
): Promise<ActionResult<PractitionerRoleRow>> {
  const result = await runAction(() =>
    callBackend<PractitionerRoleRow>(`/api/v1/practitioners/${practitionerId}/location-roles`, {
      method: 'POST',
      body: { locationId, roleId },
    }),
  );
  if (result.ok) revalidatePath('/practitioners');
  return result;
}
