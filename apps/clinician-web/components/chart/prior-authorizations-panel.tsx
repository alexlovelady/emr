'use client';

import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { NewPriorAuthDialog } from '@/components/chart/new-prior-auth-dialog';
import { DecidePriorAuthDialog } from '@/components/chart/decide-prior-auth-dialog';
import { CancelPriorAuthButton } from '@/components/chart/cancel-prior-auth-button';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Coverage, PriorAuthorization } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive' | 'warning'> = {
  pending: 'outline',
  approved: 'success',
  denied: 'destructive',
  expired: 'warning',
  cancelled: 'destructive',
};

export function PriorAuthorizationsPanel({
  priorAuthorizations,
  coverages,
  patientId,
}: {
  priorAuthorizations: PriorAuthorization[];
  coverages: Coverage[];
  patientId: string;
}) {
  const { has } = usePermissions();
  const canManage = has(PERMISSION_KEYS.PRIOR_AUTH_MANAGE);

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <NewPriorAuthDialog patientId={patientId} coverages={coverages} />
        </div>
      )}
      {priorAuthorizations.length === 0 ? (
        <EmptyState icon={ShieldCheck} message="No prior authorization requests on file." />
      ) : (
        <ul className="divide-y divide-border">
          {priorAuthorizations.map((pa) => (
            <li key={pa.id} className="space-y-1.5 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {pa.procedureCode} — {pa.procedureDescription}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Dx {pa.diagnosisCode}
                    {pa.payerReferenceNumber && ` · Ref ${pa.payerReferenceNumber}`}
                    {pa.validUntil && ` · Valid through ${new Date(pa.validUntil).toLocaleDateString()}`}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[pa.status] ?? 'outline'}>{pa.status}</Badge>
                {canManage && pa.status === 'pending' && (
                  <>
                    <DecidePriorAuthDialog priorAuthId={pa.id} patientId={patientId} />
                    <CancelPriorAuthButton priorAuthId={pa.id} patientId={patientId} />
                  </>
                )}
                {canManage && pa.status === 'approved' && <CancelPriorAuthButton priorAuthId={pa.id} patientId={patientId} />}
              </div>
              {pa.denialReason && <p className="text-xs italic text-destructive">{pa.denialReason}</p>}
              {pa.notes && <p className="text-xs italic text-muted-foreground">{pa.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
