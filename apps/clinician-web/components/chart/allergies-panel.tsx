'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { AddAllergyDialog } from '@/components/chart/add-allergy-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Allergy } from '@/lib/types';

export function AllergiesPanel({ allergies, patientId }: { allergies: Allergy[]; patientId: string }) {
  const { has } = usePermissions();
  const active = allergies.filter((a) => a.status !== 'deleted');

  return (
    <div className="space-y-3">
      {has(PERMISSION_KEYS.ALLERGY_MANAGE) && (
        <div className="flex justify-end">
          <AddAllergyDialog patientId={patientId} />
        </div>
      )}
      {active.length === 0 ? (
        <EmptyState icon={AlertTriangle} message="No known allergies recorded." />
      ) : (
        <ul className="divide-y divide-border">
          {active.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.substance}</div>
                {a.reaction && <div className="text-xs text-muted-foreground">{a.reaction}</div>}
              </div>
              {a.severity && <Badge variant={a.severity === 'severe' ? 'destructive' : 'warning'}>{a.severity}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
