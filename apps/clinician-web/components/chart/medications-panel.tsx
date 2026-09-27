import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MedicationItem } from '@/lib/types';

export function MedicationsPanel({ medications }: { medications: MedicationItem[] }) {
  const active = medications.filter((m) => m.status !== 'deleted');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Medications</CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No medications recorded.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {m.medicationName}
                  {m.dose ? ` ${m.dose}` : ''}
                  {m.route ? ` ${m.route}` : ''}
                  {m.frequency ? ` — ${m.frequency}` : ''}
                </span>
                <Badge variant={m.status === 'active' ? 'success' : 'outline'}>{m.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
