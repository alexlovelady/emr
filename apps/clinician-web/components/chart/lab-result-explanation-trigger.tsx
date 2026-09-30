'use client';

import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { proposeLabResultExplanation } from '@/lib/actions/ai-generations';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';

/** Epic-parity item 3 — drafts a plain-language explanation of a result for the patient portal;
 * only ever reaches the patient once accepted via the generic AiGenerationReview accept/reject step. */
export function LabResultExplanationTrigger({ reportId }: { reportId: string }) {
  const { has } = usePermissions();
  if (!has(PERMISSION_KEYS.RESULT_REVIEW)) return null;
  return <AiProposeTrigger label="Explain for patient (AI)" proposeFn={() => proposeLabResultExplanation(reportId)} />;
}
