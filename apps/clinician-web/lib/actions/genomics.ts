'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { GenomicReport } from '@/lib/types';

interface GenomicFindingInput {
  geneSymbol: string;
  hgvsNotation?: string;
  variantDisplay?: string;
  clinicalSignificance?: string;
  phenotypeCategory?: string;
  interpretation?: string;
}

export async function createGenomicReport(
  patientId: string,
  _prevState: ActionResult<GenomicReport> | null,
  formData: FormData,
): Promise<ActionResult<GenomicReport>> {
  const encounterId = String(formData.get('encounterId') ?? '');
  const conclusion = String(formData.get('conclusion') ?? '');
  const findingsJson = String(formData.get('findingsJson') ?? '[]');
  let findings: GenomicFindingInput[] = [];
  try {
    findings = JSON.parse(findingsJson);
  } catch {
    return { ok: false, error: 'Invalid finding rows' };
  }

  const result = await runAction(() =>
    callBackend<GenomicReport>(`/api/v1/patients/${patientId}/genomic-reports`, {
      method: 'POST',
      body: {
        encounterId,
        displayName: String(formData.get('displayName') ?? ''),
        ...(conclusion ? { conclusion } : {}),
        findings,
      },
    }),
  );
  if (result.ok) {
    revalidatePath(`/encounters/${encounterId}`);
    revalidatePath(`/patients/${patientId}`);
  }
  return result;
}

export async function reviewGenomicReport(
  id: string,
  patientId: string,
  reviewStatus: 'reviewed' | 'acknowledged',
): Promise<ActionResult<GenomicReport>> {
  const result = await runAction(() =>
    callBackend<GenomicReport>(`/api/v1/genomic-reports/${id}/review`, { method: 'POST', body: { reviewStatus } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
