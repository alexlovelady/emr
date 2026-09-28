'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { updateBillingRuleStatus } from '@/lib/actions/billing-rules';

export function ToggleRuleStatusButton({ id, status }: { id: string; status: 'active' | 'inactive' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      const result = await updateBillingRuleStatus(id, status === 'active' ? 'inactive' : 'active');
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={isPending} onClick={onClick}>
        {status === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
