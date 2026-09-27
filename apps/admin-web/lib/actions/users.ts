'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { UserRoleRow, UserRow } from '@/lib/types';

export async function createUser(email: string, password: string): Promise<ActionResult<UserRow>> {
  const result = await runAction(() => callBackend<UserRow>('/api/v1/users', { method: 'POST', body: { email, password } }));
  if (result.ok) revalidatePath('/users');
  return result;
}

export async function assignRole(userId: string, roleKey: string): Promise<ActionResult<UserRoleRow>> {
  const result = await runAction(() =>
    callBackend<UserRoleRow>(`/api/v1/users/${userId}/roles`, { method: 'POST', body: { roleKey } }),
  );
  if (result.ok) revalidatePath('/users');
  return result;
}
