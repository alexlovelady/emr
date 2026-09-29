'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/actions/action-result';
import type { ExternalCandidate } from '@/lib/types';

export function ExternalCandidateActionButton({
  label,
  variant,
  action,
}: {
  label: string;
  variant: 'default' | 'outline' | 'ghost';
  action: () => Promise<ActionResult<ExternalCandidate>>;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={isPending}>
      {label}
    </Button>
  );
}
