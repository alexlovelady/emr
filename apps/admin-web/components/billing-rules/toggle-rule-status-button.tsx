'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { updateBillingRuleStatus } from '@/lib/actions/billing-rules';

/**
 * Item 26 — the first `useOptimistic` use in this codebase (React 19 is already a dependency;
 * no new library needed for this). The toggle flips instantly instead of waiting on the round
 * trip; `updateBillingRuleStatus` already calls `revalidatePath('/billing-rules')` on success, so
 * once the transition settles the real server-rendered `status` prop matches what was already
 * shown optimistically — no `router.refresh()` needed. On failure, `useOptimistic` automatically
 * reverts to the last real `status` once the transition ends, so no manual rollback is needed either.
 */
export function ToggleRuleStatusButton({ id, status }: { id: string; status: 'active' | 'inactive' }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);

  function onClick() {
    const next = optimisticStatus === 'active' ? 'inactive' : 'active';
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await updateBillingRuleStatus(id, next);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={isPending} onClick={onClick}>
        {optimisticStatus === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
