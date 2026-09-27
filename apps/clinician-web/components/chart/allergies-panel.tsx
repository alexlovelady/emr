import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Allergy } from '@/lib/types';

export function AllergiesPanel({ allergies }: { allergies: Allergy[] }) {
  const active = allergies.filter((a) => a.status !== 'deleted');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allergies</CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No known allergies recorded.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {a.substance}
                  {a.reaction ? ` — ${a.reaction}` : ''}
                </span>
                {a.severity && <Badge variant={a.severity === 'severe' ? 'destructive' : 'warning'}>{a.severity}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
