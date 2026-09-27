'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { OrganizationRow } from '@/lib/types';

export async function createOrganization(name: string, npi: string): Promise<ActionResult<OrganizationRow>> {
  const result = await runAction(() =>
    callBackend<OrganizationRow>('/api/v1/organizations', { method: 'POST', body: { name, npi: npi.trim() || undefined } }),
  );
  if (result.ok) revalidatePath('/organizations');
  return result;
}
