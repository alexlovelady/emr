'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { RoleRow } from '@/lib/types';

export async function createRole(key: string, displayName: string): Promise<ActionResult<RoleRow>> {
  const result = await runAction(() => callBackend<RoleRow>('/api/v1/roles', { method: 'POST', body: { key, displayName } }));
  if (result.ok) revalidatePath('/roles');
  return result;
}

export async function grantRolePermission(roleId: string, permissionKey: string): Promise<ActionResult<string[]>> {
  const result = await runAction(() =>
    callBackend<string[]>(`/api/v1/roles/${roleId}/permissions`, { method: 'POST', body: { permissionKey } }),
  );
  if (result.ok) revalidatePath('/roles');
  return result;
}

export async function revokeRolePermission(roleId: string, permissionKey: string): Promise<ActionResult<string[]>> {
  const result = await runAction(() =>
    callBackend<string[]>(`/api/v1/roles/${roleId}/permissions/revoke`, { method: 'POST', body: { permissionKey } }),
  );
  if (result.ok) revalidatePath('/roles');
  return result;
}
