'use client';

import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
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

/**
 * Item 26 — was a single shared `isPending` disabling every row's buttons while ANY one row's
 * action was in flight, not just the row being acted on. `useOptimistic` over the task list fixes
 * both problems at once: the acted-on row's status flips immediately (hiding its own action
 * buttons, which also naturally prevents a double-click on that same row) while every other row
 * stays fully interactive the whole time. `completeTask`/`cancelTask` already call
 * `revalidatePath('/tasks')` on success, so once the transition settles the real server-rendered
 * `tasks` prop already matches what was shown optimistically.
 */
export function TasksTable({ tasks }: { tasks: Task[] }) {
  const [, startTransition] = useTransition();
  const [optimisticTasks, setOptimisticStatus] = useOptimistic(tasks, (state, update: { id: string; status: Task['status'] }) =>
    state.map((t) => (t.id === update.id ? { ...t, status: update.status } : t)),
  );

  if (optimisticTasks.length === 0) {
    return <EmptyState icon={ListChecks} message="No tasks — you're all caught up." />;
  }

  function run(taskId: string, nextStatus: Task['status'], action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setOptimisticStatus({ id: taskId, status: nextStatus });
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
        {optimisticTasks.map((t) => (
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
                  <Button size="sm" variant="outline" onClick={() => run(t.id, 'completed', () => completeTask(t.id))}>
                    Complete
                  </Button>
                  <ReassignTaskDialog taskId={t.id} />
                  <Button size="sm" variant="ghost" onClick={() => run(t.id, 'cancelled', () => cancelTask(t.id))}>
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
