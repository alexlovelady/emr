'use client';

import { useRouter } from 'next/navigation';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export function TaskStatusFilter({ status, mine }: { status: string; mine: boolean }) {
  const router = useRouter();

  function setStatus(value: string) {
    router.push(`/tasks?status=${value}&mine=${mine}`);
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={() => router.push(`/tasks?status=${status}&mine=${!mine}`)}>
        {mine ? 'Showing: mine only' : 'Showing: all tasks'}
      </Button>
    </div>
  );
}
