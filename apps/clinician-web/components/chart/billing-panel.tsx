'use client';

import { useState } from 'react';
import { DollarSign, FileWarning, Receipt, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { RunEligibilityDialog } from '@/components/chart/run-eligibility-dialog';
import { ResolveDenialDialog } from '@/components/chart/resolve-denial-dialog';
import { AppealPanel } from '@/components/chart/appeal-panel';
import { ClaimRow } from '@/components/chart/claim-row';
import { RecordPaymentDialog } from '@/components/chart/record-payment-dialog';
import { PaymentPlansSection } from '@/components/chart/payment-plans-section';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { proposeDenialSummary } from '@/lib/actions/ai-generations';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Appeal, Charge, Claim, Coverage, Denial, EligibilityCheck, PatientLedger, PaymentPlanWithInstallments } from '@/lib/types';

export function BillingPanel({
  patientId,
  coverages,
  charges,
  claims,
  denials,
  appeals,
  eligibilityChecks,
  ledger,
  paymentPlans,
}: {
  patientId: string;
  coverages: Coverage[];
  charges: Charge[];
  claims: Claim[];
  denials: Denial[];
  appeals: Appeal[];
  eligibilityChecks: EligibilityCheck[];
  ledger: PatientLedger | null;
  paymentPlans: PaymentPlanWithInstallments[];
}) {
  const { has } = usePermissions();
  const [expandedDenial, setExpandedDenial] = useState<string | null>(null);
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
            {denials.map((d) => {
              const denialAppeals = appeals.filter((a) => a.denialId === d.id);
              return (
                <li key={d.id} className="space-y-2 py-2.5">
                  <div className="flex items-center gap-3 text-sm">
                    <FileWarning className={`h-4 w-4 shrink-0 ${d.status === 'open' ? 'text-destructive' : 'text-muted-foreground'}`} />
                    <span className="flex-1">
                      {d.denialReasonCode} — {d.denialReasonText}
                    </span>
                    <Badge variant={d.status === 'open' ? 'destructive' : d.status === 'appealed' ? 'warning' : 'success'}>{d.status}</Badge>
                    {d.status === 'open' && has(PERMISSION_KEYS.DENIAL_MANAGE) && <ResolveDenialDialog denialId={d.id} patientId={patientId} />}
                    {has(PERMISSION_KEYS.DENIAL_MANAGE) && (d.status === 'open' || denialAppeals.length > 0) && (
                      <Button size="sm" variant="ghost" onClick={() => setExpandedDenial(expandedDenial === d.id ? null : d.id)}>
                        Appeal{denialAppeals.length > 0 ? ` (${denialAppeals.length})` : ''}
                      </Button>
                    )}
                  </div>
                  {d.status === 'open' && has(PERMISSION_KEYS.DENIAL_MANAGE) && (
                    <AiProposeTrigger label="Explain with AI" proposeFn={() => proposeDenialSummary(d.id)} />
                  )}
                  {expandedDenial === d.id && has(PERMISSION_KEYS.DENIAL_MANAGE) && (
                    <AppealPanel patientId={patientId} denial={d} appeals={denialAppeals} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {openDenials.length > 0 && (
          <p className="text-xs text-destructive">{openDenials.length} denial(s) need resolution.</p>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ledger</h3>
          <div className="flex items-center gap-3">
            {ledger && <span className="text-lg font-semibold">Balance: ${ledger.balance}</span>}
            {has(PERMISSION_KEYS.PAYMENT_RECORD) && <RecordPaymentDialog patientId={patientId} />}
          </div>
        </div>
        {!ledger || ledger.entries.length === 0 ? (
          <EmptyState icon={Receipt} message="No ledger entries." />
        ) : (
          <ul className="divide-y divide-border">
            {ledger.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex-1">{e.description}</span>
                {e.paymentMethod && <Badge variant="outline">{e.paymentMethod}</Badge>}
                <span className="text-xs text-muted-foreground">{e.entryType}</span>
                <span className={Number(e.amount) < 0 ? 'text-emerald-600' : ''}>${e.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PaymentPlansSection patientId={patientId} paymentPlans={paymentPlans} />
    </div>
  );
}
