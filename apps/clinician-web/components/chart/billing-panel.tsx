'use client';

import { DollarSign, FileWarning, Receipt, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { RunEligibilityDialog } from '@/components/chart/run-eligibility-dialog';
import { ResolveDenialDialog } from '@/components/chart/resolve-denial-dialog';
import { ClaimRow } from '@/components/chart/claim-row';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Charge, Claim, Coverage, Denial, EligibilityCheck, PatientLedger } from '@/lib/types';

export function BillingPanel({
  patientId,
  coverages,
  charges,
  claims,
  denials,
  eligibilityChecks,
  ledger,
}: {
  patientId: string;
  coverages: Coverage[];
  charges: Charge[];
  claims: Claim[];
  denials: Denial[];
  eligibilityChecks: EligibilityCheck[];
  ledger: PatientLedger | null;
}) {
  const { has } = usePermissions();
  const openDenials = denials.filter((d) => d.status === 'open');

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Eligibility</h3>
          {has(PERMISSION_KEYS.ELIGIBILITY_CHECK) && <RunEligibilityDialog patientId={patientId} coverages={coverages} />}
        </div>
        {eligibilityChecks.length === 0 ? (
          <EmptyState icon={ShieldCheck} message="No eligibility checks run." />
        ) : (
          <ul className="divide-y divide-border">
            {eligibilityChecks.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <ShieldCheck className={`h-4 w-4 shrink-0 ${e.isEligible ? 'text-emerald-600' : 'text-destructive'}`} />
                <span className="flex-1">
                  Copay ${e.copayAmount ?? '—'} · Deductible remaining ${e.deductibleRemaining ?? '—'}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(e.checkedAt).toLocaleDateString()}</span>
                <Badge variant={e.isEligible ? 'success' : 'destructive'}>{e.isEligible ? 'eligible' : 'not eligible'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold">Charges</h3>
        {charges.length === 0 ? (
          <EmptyState icon={DollarSign} message="No charges on file." />
        ) : (
          <ul className="divide-y divide-border">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1">
                  {c.code} — {c.description} (${c.unitPrice} × {c.units})
                </span>
                <Badge variant={c.status === 'billed' ? 'success' : c.status === 'coded' ? 'outline' : 'warning'}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold">Claims</h3>
        {claims.length === 0 ? (
          <EmptyState icon={Receipt} message="No claims on file." />
        ) : (
          <ul className="divide-y divide-border">
            {claims.map((c) => (
              <ClaimRow key={c.id} claim={c} patientId={patientId} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold">Denials</h3>
        {denials.length === 0 ? (
          <EmptyState icon={FileWarning} message="No denials on file." />
        ) : (
          <ul className="divide-y divide-border">
            {denials.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                <FileWarning className={`h-4 w-4 shrink-0 ${d.status === 'open' ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className="flex-1">
                  {d.denialReasonCode} — {d.denialReasonText}
                </span>
                <Badge variant={d.status === 'open' ? 'destructive' : 'success'}>{d.status}</Badge>
                {d.status === 'open' && has(PERMISSION_KEYS.DENIAL_MANAGE) && <ResolveDenialDialog denialId={d.id} patientId={patientId} />}
              </li>
            ))}
          </ul>
        )}
        {openDenials.length > 0 && (
          <p className="text-xs text-destructive">{openDenials.length} denial(s) need resolution.</p>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ledger</h3>
          {ledger && (
            <span className="text-lg font-semibold">
              Balance: ${ledger.balance}
            </span>
          )}
        </div>
        {!ledger || ledger.entries.length === 0 ? (
          <EmptyState icon={Receipt} message="No ledger entries." />
        ) : (
          <ul className="divide-y divide-border">
            {ledger.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1">{e.description}</span>
                <span className="text-xs text-muted-foreground">{e.entryType}</span>
                <span className={Number(e.amount) < 0 ? 'text-emerald-600' : ''}>${e.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
