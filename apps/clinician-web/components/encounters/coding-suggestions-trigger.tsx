'use client';

import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { proposeCodingSuggestions } from '@/lib/actions/ai-generations';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';

export function CodingSuggestionsTrigger({ encounterId }: { encounterId: string }) {
  const { has } = usePermissions();
  if (!has(PERMISSION_KEYS.CODING_REVIEW)) return null;
  return <AiProposeTrigger label="Coding suggestions (AI)" proposeFn={() => proposeCodingSuggestions(encounterId)} />;
}
