'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { executeSavedCohort } from '@/lib/actions/cohorts';

export function RunCohortButton({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onRun() {
    startTransition(async () => {
      const result = await executeSavedCohort(cohortId);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" disabled={isPending} onClick={onRun}>
      {isPending ? 'Running…' : 'Run again'}
    </Button>
  );
}
