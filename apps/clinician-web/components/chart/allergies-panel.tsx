'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { AddAllergyDialog } from '@/components/chart/add-allergy-dialog';
import { EditAllergyDialog } from '@/components/chart/edit-allergy-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { resolveAllergy } from '@/lib/actions/allergies';
import type { Allergy } from '@/lib/types';

export function AllergiesPanel({ allergies, patientId }: { allergies: Allergy[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const visible = allergies.filter((a) => a.status !== 'deleted');
  const canManage = has(PERMISSION_KEYS.ALLERGY_MANAGE);

  function onResolve(id: string) {
    startTransition(async () => {
      const result = await resolveAllergy(id, patientId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <AddAllergyDialog patientId={patientId} />
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={AlertTriangle} message="No known allergies recorded." />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <AlertTriangle
                className={`h-4 w-4 shrink-0 ${a.status === 'active' ? 'text-destructive' : 'text-muted-foreground/40'}`}
                strokeWidth={2}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.substance}</div>
                {a.reaction && <div className="text-xs text-muted-foreground">{a.reaction}</div>}
              </div>
              {a.severity && <Badge variant={a.severity === 'severe' ? 'destructive' : 'warning'}>{a.severity}</Badge>}
              {a.status !== 'active' && <Badge variant="outline">{a.status}</Badge>}
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  <EditAllergyDialog allergy={a} patientId={patientId} />
                  {a.status === 'active' && (
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onResolve(a.id)}>
                      Resolve
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
