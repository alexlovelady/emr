'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Task } from '@/lib/types';

export async function createTask(_prevState: ActionResult<Task> | null, formData: FormData): Promise<ActionResult<Task>> {
  const patientId = String(formData.get('patientId') ?? '');
  const assignedToUserId = String(formData.get('assignedToUserId') ?? '');
  const description = String(formData.get('description') ?? '');
  const result = await runAction(() =>
    callBackend<Task>('/api/v1/tasks', {
      method: 'POST',
      body: {
        taskType: String(formData.get('taskType') ?? ''),
        title: String(formData.get('title') ?? ''),
        priority: String(formData.get('priority') ?? 'normal'),
        ...(patientId ? { patientId } : {}),
        ...(assignedToUserId ? { assignedToUserId } : {}),
        ...(description ? { description } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath('/tasks');
  return result;
}

export async function reassignTask(id: string, assignedToUserId: string): Promise<ActionResult<Task>> {
  const result = await runAction(() =>
    callBackend<Task>(`/api/v1/tasks/${id}/reassign`, { method: 'POST', body: { assignedToUserId } }),
  );
  if (result.ok) revalidatePath('/tasks');
  return result;
}

export async function completeTask(id: string): Promise<ActionResult<Task>> {
  const result = await runAction(() => callBackend<Task>(`/api/v1/tasks/${id}/complete`, { method: 'POST' }));
  if (result.ok) revalidatePath('/tasks');
  return result;
}

export async function cancelTask(id: string): Promise<ActionResult<Task>> {
  const result = await runAction(() => callBackend<Task>(`/api/v1/tasks/${id}/cancel`, { method: 'POST' }));
  if (result.ok) revalidatePath('/tasks');
  return result;
}
