import { Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import type { Problem } from '@/lib/types';

export function ProblemsPanel({ problems }: { problems: Problem[] }) {
  const active = problems.filter((p) => p.status !== 'deleted');

  if (active.length === 0) {
    return <EmptyState icon={Stethoscope} message="No problems recorded." />;
  }

  return (
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
          <Badge variant={p.clinicalStatus === 'active' ? 'warning' : 'outline'}>{p.clinicalStatus}</Badge>
        </li>
      ))}
    </ul>
  );
}
