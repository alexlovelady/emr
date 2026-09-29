'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resolveAlert } from '@/lib/actions/alerts';
import type { AlertRow } from '@/lib/types';

export function AlertRowActions({ alert }: { alert: AlertRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (alert.status !== 'open') return null;

  function onResolve() {
    startTransition(async () => {
      const result = await resolveAlert(alert.id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={onResolve}>
      {isPending ? 'Resolving…' : 'Resolve'}
    </Button>
  );
}
