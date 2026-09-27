import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { TasksTable } from '@/components/tasks/tasks-table';
import { NewTaskDialog } from '@/components/tasks/new-task-dialog';
import { TaskStatusFilter } from '@/components/tasks/task-status-filter';
import type { CurrentUser, Task } from '@/lib/types';

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const { status, mine } = await searchParams;
  const user = await callBackend<CurrentUser>('/api/v1/auth/me');
  const showMineOnly = mine !== 'false';

  const tasks = await callBackend<Task[]>('/api/v1/tasks', {
    query: {
      ...(showMineOnly ? { assignedToUserId: user.id } : {}),
      ...(status ? { status } : { status: 'open' }),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} tasks</p>
        </div>
        <NewTaskDialog />
      </div>
      <TaskStatusFilter status={status ?? 'open'} mine={showMineOnly} />
      <Card>
        <CardContent className="pt-6">
          <TasksTable tasks={tasks} />
        </CardContent>
      </Card>
    </div>
  );
}
