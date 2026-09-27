'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PractitionerRow } from '@/lib/types';

export async function createPractitioner(input: {
  userId: string;
  organizationId: string;
  displayName: string;
  npi: string;
  taxonomyCode: string;
}): Promise<ActionResult<PractitionerRow>> {
  const result = await runAction(() =>
    callBackend<PractitionerRow>('/api/v1/practitioners', {
      method: 'POST',
      body: {
        userId: input.userId,
        organizationId: input.organizationId,
        displayName: input.displayName,
        npi: input.npi.trim() || undefined,
        taxonomyCode: input.taxonomyCode.trim() || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath('/practitioners');
  return result;
}
