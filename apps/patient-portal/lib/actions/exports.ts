'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { ExportRequest } from '@/lib/types';

export type ExportFormat = 'json' | 'pdf' | 'ccd-xml';

export async function requestExport(patientId: string, format: ExportFormat = 'json'): Promise<ActionResult<{ request: ExportRequest; downloadUrl: string }>> {
  const result = await runAction(() =>
    callBackend<{ request: ExportRequest; downloadUrl: string }>(`/api/v1/portal/patients/${patientId}/export-requests`, {
      method: 'POST',
      query: { format },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/documents`);
  return result;
}
