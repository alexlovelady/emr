import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Problem } from '@/lib/types';

export function ProblemsPanel({ problems }: { problems: Problem[] }) {
  const active = problems.filter((p) => p.status !== 'deleted');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Problems</CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No problems recorded.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 text-sm">
                <span>{p.displayName}</span>
                <Badge variant={p.clinicalStatus === 'active' ? 'warning' : 'outline'}>{p.clinicalStatus}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
