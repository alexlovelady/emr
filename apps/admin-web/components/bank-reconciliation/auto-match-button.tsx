'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { autoMatchDeposits } from '@/lib/actions/bank-reconciliation';

export function AutoMatchButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await autoMatchDeposits();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Matched ${result.data.matched}, ambiguous ${result.data.ambiguous}, ${result.data.remaining} still unmatched.`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={onClick}>
      <Wand2 className="mr-1.5 h-4 w-4" /> {isPending ? 'Matching…' : 'Auto-match'}
    </Button>
  );
}
