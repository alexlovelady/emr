'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { DiagnosticReport } from '@/lib/types';

interface ResultRowInput {
  code: string;
  display: string;
  valueText?: string;
  valueQuantity?: number;
  unit?: string;
}

export async function createDiagnosticReport(
  patientId: string,
  _prevState: ActionResult<DiagnosticReport> | null,
  formData: FormData,
): Promise<ActionResult<DiagnosticReport>> {
  const encounterId = String(formData.get('encounterId') ?? '');
  const conclusion = String(formData.get('conclusion') ?? '');
  const resultsJson = String(formData.get('resultsJson') ?? '[]');
  let results: ResultRowInput[] = [];
  try {
    results = JSON.parse(resultsJson);
  } catch {
    return { ok: false, error: 'Invalid result rows' };
  }

  const result = await runAction(() =>
    callBackend<DiagnosticReport>(`/api/v1/patients/${patientId}/diagnostic-reports`, {
      method: 'POST',
      body: {
        encounterId,
        displayName: String(formData.get('displayName') ?? ''),
        criticalFlag: formData.get('criticalFlag') === 'on',
        abnormalFlag: formData.get('abnormalFlag') === 'on',
        ...(conclusion ? { conclusion } : {}),
        results,
      },
    }),
  );
  if (result.ok) {
    revalidatePath(`/encounters/${encounterId}`);
    revalidatePath(`/patients/${patientId}`);
  }
  return result;
}

export async function reviewDiagnosticReport(id: string, patientId: string, reviewStatus: 'reviewed' | 'acknowledged'): Promise<ActionResult<DiagnosticReport>> {
  const result = await runAction(() =>
    callBackend<DiagnosticReport>(`/api/v1/diagnostic-reports/${id}/review`, { method: 'POST', body: { reviewStatus } }),
  );
  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
    revalidatePath('/results-inbox');
  }
  return result;
}
