'use client';

import { CreditCard, Fingerprint } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { AddCoverageDialog } from '@/components/chart/add-coverage-dialog';
import { AddIdentifierDialog } from '@/components/chart/add-identifier-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Coverage, PatientIdentifier } from '@/lib/types';

export function CoveragePanel({ coverages, identifiers, patientId }: { coverages: Coverage[]; identifiers: PatientIdentifier[]; patientId: string }) {
  const { has } = usePermissions();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Insurance coverage</h3>
          {has(PERMISSION_KEYS.COVERAGE_MANAGE) && <AddCoverageDialog patientId={patientId} />}
        </div>
        {coverages.length === 0 ? (
          <EmptyState icon={CreditCard} message="No insurance coverage on file." />
        ) : (
          <ul className="divide-y divide-border">
            {coverages.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.payerName}</div>
                  <div className="text-xs text-muted-foreground">
                    Member {c.memberId}
                    {c.planName ? ` · ${c.planName}` : ''} · {c.effectiveStart}
                    {c.effectiveEnd ? ` – ${c.effectiveEnd}` : ' – present'}
                  </div>
                </div>
                <Badge variant={c.coverageType === 'primary' ? 'success' : 'outline'}>{c.coverageType}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">External identifiers</h3>
          {has(PERMISSION_KEYS.PATIENT_WRITE_DEMOGRAPHICS) && <AddIdentifierDialog patientId={patientId} />}
        </div>
        {identifiers.length === 0 ? (
          <EmptyState icon={Fingerprint} message="No external identifiers recorded." />
        ) : (
          <ul className="divide-y divide-border">
            {identifiers.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.identifierSystem}</div>
                  <div className="text-xs text-muted-foreground">{i.value}</div>
                </div>
                {i.isPrimary && <Badge variant="success">primary</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
