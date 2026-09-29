'use client';

import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { ExternalCandidateActionButton } from '@/components/chart/external-candidate-action-button';
import { ReplaceExternalCandidateDialog } from '@/components/chart/replace-external-candidate-dialog';
import { acceptExternalCandidate, rejectExternalCandidate, markDuplicateExternalCandidate } from '@/lib/actions/external-candidates';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { Allergy, ExternalCandidate, MedicationItem, Problem } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive' | 'warning'> = {
  pending: 'outline',
  accepted: 'success',
  rejected: 'destructive',
  duplicate: 'warning',
  replaced: 'success',
};

const ORIGIN_LABEL: Record<string, string> = {
  'c-cda': 'C-CDA',
  fhir: 'FHIR',
  hl7: 'HL7',
};

function summarize(candidate: ExternalCandidate): string {
  const p = candidate.payload;
  if (candidate.resourceType === 'problem') return String(p.displayName ?? 'Unnamed problem');
  if (candidate.resourceType === 'allergy') return String(p.substance ?? 'Unnamed allergy');
  return String(p.medicationName ?? 'Unnamed medication');
}

function detail(candidate: ExternalCandidate): string | null {
  const p = candidate.payload;
  if (candidate.resourceType === 'problem') {
    return [p.codeSystem && p.code ? `${p.codeSystem} ${p.code}` : null, p.onsetDate ? `Onset ${p.onsetDate}` : null]
      .filter(Boolean)
      .join(' · ') || null;
  }
  if (candidate.resourceType === 'allergy') {
    return [p.reaction ? String(p.reaction) : null, p.severity ? String(p.severity) : null].filter(Boolean).join(' · ') || null;
  }
  return [p.dose ? String(p.dose) : null, p.route ? String(p.route) : null, p.frequency ? String(p.frequency) : null]
    .filter(Boolean)
    .join(' · ') || null;
}

export function ExternalCandidatesPanel({
  candidates,
  patientId,
  problems,
  allergies,
  medications,
}: {
  candidates: ExternalCandidate[];
  patientId: string;
  problems: Problem[];
  allergies: Allergy[];
  medications: MedicationItem[];
}) {
  const { has } = usePermissions();
  const canManage = has(PERMISSION_KEYS.EXTERNAL_CANDIDATE_MANAGE);

  function targetsFor(resourceType: ExternalCandidate['resourceType']) {
    if (resourceType === 'problem') return problems.map((p) => ({ id: p.id, label: p.displayName }));
    if (resourceType === 'allergy') return allergies.map((a) => ({ id: a.id, label: a.substance }));
    return medications.map((m) => ({ id: m.id, label: m.medicationName }));
  }

  if (candidates.length === 0) {
    return <EmptyState icon={Inbox} message="No records imported from outside sources yet." />;
  }

  return (
    <ul className="divide-y divide-border">
      {candidates.map((candidate) => (
        <li key={candidate.id} className="space-y-1.5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{summarize(candidate)}</div>
              <div className="text-xs text-muted-foreground">
                {ORIGIN_LABEL[candidate.originType] ?? candidate.originType} import
                {detail(candidate) ? ` · ${detail(candidate)}` : ''} · {new Date(candidate.createdAt).toLocaleDateString()}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[candidate.status] ?? 'outline'}>{candidate.status}</Badge>
            {canManage && candidate.status === 'pending' && (
              <div className="flex flex-wrap gap-2">
                <ExternalCandidateActionButton
                  label="Accept"
                  variant="default"
                  action={() => acceptExternalCandidate(candidate.id, patientId)}
                />
                <ReplaceExternalCandidateDialog
                  candidateId={candidate.id}
                  patientId={patientId}
                  targets={targetsFor(candidate.resourceType)}
                />
                <ExternalCandidateActionButton
                  label="Mark duplicate"
                  variant="outline"
                  action={() => markDuplicateExternalCandidate(candidate.id, patientId)}
                />
                <ExternalCandidateActionButton
                  label="Reject"
                  variant="ghost"
                  action={() => rejectExternalCandidate(candidate.id, patientId)}
                />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
