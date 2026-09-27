'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/chart/empty-state';
import { AddProblemDialog } from '@/components/chart/add-problem-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { updateProblemStatus } from '@/lib/actions/problems';
import type { Problem } from '@/lib/types';

export function ProblemsPanel({ problems, patientId }: { problems: Problem[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const active = problems.filter((p) => p.status !== 'deleted');
  const canManage = has(PERMISSION_KEYS.PROBLEM_MANAGE);

  function onStatusChange(problemId: string, clinicalStatus: string) {
    startTransition(async () => {
      const result = await updateProblemStatus(problemId, patientId, clinicalStatus as 'active' | 'resolved' | 'inactive');
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <AddProblemDialog patientId={patientId} />
        </div>
      )}
      {active.length === 0 ? (
        <EmptyState icon={Stethoscope} message="No problems recorded." />
      ) : (
        <ul className="divide-y divide-border">
          {active.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${p.clinicalStatus === 'active' ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.displayName}</div>
                {p.onsetDate && <div className="text-xs text-muted-foreground">Onset {p.onsetDate}</div>}
              </div>
              {canManage ? (
                <Select value={p.clinicalStatus} onValueChange={(v) => onStatusChange(p.id, v)} disabled={isPending}>
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={p.clinicalStatus === 'active' ? 'warning' : 'outline'}>{p.clinicalStatus}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
