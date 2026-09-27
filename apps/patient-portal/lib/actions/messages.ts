'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Message, MessageThread } from '@/lib/types';

export async function createThread(patientId: string, subject: string, body: string): Promise<ActionResult<MessageThread>> {
  const result = await runAction(() =>
    callBackend<MessageThread>(`/api/v1/portal/patients/${patientId}/message-threads`, { method: 'POST', body: { subject, body } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/messages`);
  return result;
}

export async function replyToThread(patientId: string, threadId: string, body: string): Promise<ActionResult<Message>> {
  const result = await runAction(() =>
    callBackend<Message>(`/api/v1/portal/patients/${patientId}/message-threads/${threadId}/messages`, {
      method: 'POST',
      body: { body },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/messages`);
  return result;
}

export async function markThreadRead(patientId: string, threadId: string): Promise<ActionResult<void>> {
  return runAction(() =>
    callBackend<void>(`/api/v1/portal/patients/${patientId}/message-threads/${threadId}/read`, { method: 'POST' }),
  );
}
