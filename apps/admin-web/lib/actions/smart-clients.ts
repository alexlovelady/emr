'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { SmartClientCreateResult, SmartClientRow } from '@/lib/types';

export interface CreateSmartClientInput {
  displayName: string;
  description: string;
  developerName: string;
  websiteUrl: string;
  logoUrl: string;
  allowedScopes: string[];
  redirectUris: string[];
  clientType: 'confidential' | 'public';
  launchUri: string;
}

export async function createSmartClient(input: CreateSmartClientInput): Promise<ActionResult<SmartClientCreateResult>> {
  const result = await runAction(() =>
    callBackend<SmartClientCreateResult>('/api/v1/smart-clients/admin', {
      method: 'POST',
      body: {
        displayName: input.displayName,
        description: input.description.trim() || undefined,
        developerName: input.developerName.trim() || undefined,
        websiteUrl: input.websiteUrl.trim() || undefined,
        logoUrl: input.logoUrl.trim() || undefined,
        allowedScopes: input.allowedScopes,
        redirectUris: input.redirectUris,
        clientType: input.clientType,
        launchUri: input.launchUri.trim() || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath('/smart-apps');
  return result;
}

export interface UpdateSmartClientInput {
  displayName: string;
  description: string;
  developerName: string;
  websiteUrl: string;
}

export async function updateSmartClient(id: string, input: UpdateSmartClientInput): Promise<ActionResult<SmartClientRow>> {
  const result = await runAction(() =>
    callBackend<SmartClientRow>(`/api/v1/smart-clients/admin/${id}`, {
      method: 'PATCH',
      body: {
        displayName: input.displayName,
        description: input.description.trim() || null,
        developerName: input.developerName.trim() || null,
        websiteUrl: input.websiteUrl.trim() || null,
      },
    }),
  );
  if (result.ok) revalidatePath('/smart-apps');
  return result;
}

export async function deactivateSmartClient(id: string): Promise<ActionResult<SmartClientRow>> {
  const result = await runAction(() => callBackend<SmartClientRow>(`/api/v1/smart-clients/admin/${id}/deactivate`, { method: 'POST' }));
  if (result.ok) revalidatePath('/smart-apps');
  return result;
}

export async function activateSmartClient(id: string): Promise<ActionResult<SmartClientRow>> {
  const result = await runAction(() => callBackend<SmartClientRow>(`/api/v1/smart-clients/admin/${id}/activate`, { method: 'POST' }));
  if (result.ok) revalidatePath('/smart-apps');
  return result;
}
