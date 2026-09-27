'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Note } from '@/lib/types';

export async function createNote(encounterId: string, noteType: string, templateId?: string): Promise<ActionResult<Note>> {
  const result = await runAction(() =>
    callBackend<Note>('/api/v1/notes', {
      method: 'POST',
      body: { encounterId, noteType, ...(templateId ? { templateId } : {}) },
    }),
  );
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function updateNoteContent(id: string, encounterId: string, content: Record<string, string>): Promise<ActionResult<Note>> {
  const result = await runAction(() => callBackend<Note>(`/api/v1/notes/${id}/content`, { method: 'PUT', body: { content } }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function submitNoteForReview(id: string, encounterId: string): Promise<ActionResult<Note>> {
  const result = await runAction(() => callBackend<Note>(`/api/v1/notes/${id}/submit-for-review`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function signNote(id: string, encounterId: string): Promise<ActionResult<Note>> {
  const result = await runAction(() => callBackend<Note>(`/api/v1/notes/${id}/sign`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function voidNote(id: string, encounterId: string, reason: string): Promise<ActionResult<Note>> {
  const result = await runAction(() => callBackend<Note>(`/api/v1/notes/${id}/void`, { method: 'POST', body: { reason } }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function amendNote(id: string, encounterId: string): Promise<ActionResult<Note>> {
  const result = await runAction(() => callBackend<Note>(`/api/v1/notes/${id}/amend`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}
