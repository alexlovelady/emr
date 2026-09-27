'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { submitClaim } from '@/lib/actions/claims';
import type { Claim, FullClaimTimeline } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'destructive'> = {
  paid: 'success',
  accepted: 'success',
  submitted: 'outline',
  draft: 'outline',
  adjudicated: 'warning',
  rejected: 'destructive',
  denied: 'destructive',
};

export function ClaimRow({ claim, patientId }: { claim: Claim; patientId: string }) {
  const { has } = usePermissions();
  const [expanded, setExpanded] = useState(false);
  const [timeline, setTimeline] = useState<FullClaimTimeline | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = has(PERMISSION_KEYS.CLAIM_SUBMIT) && (claim.status === 'draft' || claim.status === 'rejected');

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !timeline) {
      const res = await fetch(`/api/backend/claims/${claim.id}/timeline`);
      if (res.ok) setTimeline(await res.json());
    }
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await submitClaim(claim.id, patientId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <li>
      {/* A real <button> can't contain the nested Submit <button> (invalid HTML, causes a hydration error) — this row's own toggle target is a div with a button role instead. */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">${claim.totalChargeAmount}</div>
          <div className="text-xs text-muted-foreground">Version {claim.currentVersion} · {new Date(claim.createdAt).toLocaleDateString()}</div>
        </div>
        <Badge variant={STATUS_VARIANT[claim.status] ?? 'outline'}>{claim.status}</Badge>
        {canSubmit && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              onSubmit();
            }}
          >
            Submit
          </Button>
        )}
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-border bg-muted/30 p-3 text-xs">
          {!timeline ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div>
                <span className="font-semibold">Versions: </span>
                {timeline.versions.map((v) => `v${v.versionNumber} (${v.versionStatus})`).join(', ') || 'none'}
              </div>
              <div>
                <span className="font-semibold">Denials: </span>
                {timeline.denials.length === 0 ? 'none' : timeline.denials.map((d) => `${d.denialReasonCode} (${d.status})`).join(', ')}
              </div>
              <div>
                <span className="font-semibold">Remittances: </span>
                {timeline.remittances.length === 0
                  ? 'none'
                  : timeline.remittances.map((r) => `paid $${r.payerPaidAmount}`).join(', ')}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
