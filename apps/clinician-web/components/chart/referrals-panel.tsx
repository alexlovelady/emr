'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/chart/empty-state';
import { NewReferralDialog } from '@/components/chart/new-referral-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { updateReferralStatus } from '@/lib/actions/referrals';
import type { Referral } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive' | 'warning'> = {
  pending: 'outline',
  sent: 'outline',
  scheduled: 'warning',
  completed: 'success',
  declined: 'destructive',
  cancelled: 'destructive',
};

/** Mirrors ReferralService's own TRANSITIONS map — only offer a legal next status. */
const NEXT_STATUSES: Record<string, Referral['status'][]> = {
  pending: ['sent', 'cancelled'],
  sent: ['scheduled', 'declined', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
};

export function ReferralsPanel({ referrals, patientId }: { referrals: Referral[]; patientId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const canManage = has(PERMISSION_KEYS.REFERRAL_MANAGE);

  function onStatusChange(referralId: string, status: string) {
    startTransition(async () => {
      const result = await updateReferralStatus(referralId, patientId, status as Referral['status']);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <NewReferralDialog patientId={patientId} />
        </div>
      )}
      {referrals.length === 0 ? (
        <EmptyState icon={Share2} message="No referrals on file." />
      ) : (
        <ul className="divide-y divide-border">
          {referrals.map((r) => {
            const nextStatuses = NEXT_STATUSES[r.status] ?? [];
            return (
              <li key={r.id} className="space-y-1.5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {r.specialty} — {r.referredToPractitionerId ? 'internal' : r.externalProviderName ?? 'unassigned'}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.reason}</div>
                  </div>
                  {r.urgency !== 'routine' && <Badge variant="destructive">{r.urgency}</Badge>}
                  {canManage && nextStatuses.length > 0 ? (
                    <Select value={r.status} onValueChange={(v) => onStatusChange(r.id, v)} disabled={isPending}>
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={r.status} disabled>
                          {r.status}
                        </SelectItem>
                        {nextStatuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>{r.status}</Badge>
                  )}
                </div>
                {r.notes && <p className="text-xs italic text-muted-foreground">{r.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
