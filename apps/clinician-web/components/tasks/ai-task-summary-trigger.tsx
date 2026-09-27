'use client';

import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { proposeTaskSummary } from '@/lib/actions/ai-generations';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';

export function AiTaskSummaryTrigger({ assignedToUserId }: { assignedToUserId: string }) {
  const { has } = usePermissions();
  if (!has(PERMISSION_KEYS.TASK_MANAGE)) return null;
  return <AiProposeTrigger label="Summarize with AI" proposeFn={() => proposeTaskSummary(assignedToUserId, undefined)} />;
}
