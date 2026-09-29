'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { ListChecks } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { completeTask, cancelTask } from '@/lib/actions/tasks';
import { ReassignTaskDialog } from '@/components/tasks/reassign-task-dialog';
import type { Task } from '@/lib/types';

const PRIORITY_VARIANT: Record<Task['priority'], 'outline' | 'warning' | 'destructive'> = {
  low: 'outline',
  normal: 'outline',
  high: 'warning',
  urgent: 'destructive',
};

export function TasksTable({ tasks }: { tasks: Task[] }) {
  const [isPending, startTransition] = useTransition();

  if (tasks.length === 0) {
    return <EmptyState icon={ListChecks} message="No tasks — you're all caught up." />;
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.title}</TableCell>
            <TableCell className="text-muted-foreground">{t.taskType.replace(/_/g, ' ')}</TableCell>
            <TableCell>
              {t.patientId ? (
                <Link href={`/patients/${t.patientId}`} className="text-primary hover:underline">
                  View chart
                </Link>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANT[t.priority]}>{t.priority}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '—'}</TableCell>
            <TableCell>
              {t.status === 'open' && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => completeTask(t.id))}>
                    Complete
                  </Button>
                  <ReassignTaskDialog taskId={t.id} />
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => cancelTask(t.id))}>
                    Cancel
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
