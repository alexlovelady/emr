'use client';

import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { NewIntakeResponseDialog } from '@/components/chart/new-intake-response-dialog';
import { IntakeResponseForm } from '@/components/chart/intake-response-form';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { IntakeFormResponse, IntakeFormTemplate } from '@/lib/types';

export function IntakePanel({
  responses,
  templates,
  patientId,
}: {
  responses: IntakeFormResponse[];
  templates: IntakeFormTemplate[];
  patientId: string;
}) {
  const { has } = usePermissions();
  const templatesById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      {has(PERMISSION_KEYS.INTAKE_RESPONSE_MANAGE) && templates.length > 0 && (
        <div className="flex justify-end">
          <NewIntakeResponseDialog patientId={patientId} templates={templates} />
        </div>
      )}
      {responses.length === 0 ? (
        <EmptyState icon={ClipboardList} message="No intake forms assigned." />
      ) : (
        <div className="space-y-4">
          {responses.map((r) => {
            const template = templatesById.get(r.templateId);
            return (
              <div key={r.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{template?.name ?? 'Intake form'}</span>
                  <Badge variant={r.status === 'submitted' ? 'success' : 'outline'}>{r.status}</Badge>
                </div>
                {template && r.status === 'draft' ? (
                  <IntakeResponseForm patientId={patientId} response={r} template={template} />
                ) : (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    {template?.schema.map((f) => (
                      <div key={f.key} className="flex justify-between border-b border-border py-1.5 last:border-0">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span>{String(r.answers[f.key] ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
