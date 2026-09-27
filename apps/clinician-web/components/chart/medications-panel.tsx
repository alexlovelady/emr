import { Pill } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import type { MedicationItem } from '@/lib/types';

export function MedicationsPanel({ medications }: { medications: MedicationItem[] }) {
  const active = medications.filter((m) => m.status !== 'deleted');

  if (active.length === 0) {
    return <EmptyState icon={Pill} message="No medications recorded." />;
  }

  return (
    <ul className="divide-y divide-border">
      {active.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-3">
          <Pill className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{m.medicationName}</div>
            <div className="text-xs text-muted-foreground">
              {[m.dose, m.route, m.frequency].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <Badge variant={m.status === 'active' ? 'success' : 'outline'}>{m.status}</Badge>
        </li>
      ))}
    </ul>
  );
}
