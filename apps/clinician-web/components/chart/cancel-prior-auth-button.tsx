'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cancelPriorAuthorization } from '@/lib/actions/prior-authorizations';

export function CancelPriorAuthButton({ priorAuthId, patientId }: { priorAuthId: string; patientId: string }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await cancelPriorAuthorization(priorAuthId, patientId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={isPending}>
      Cancel
    </Button>
  );
}
