import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { TemplatesTable } from '@/components/intake/templates-table';
import { NewTemplateDialog } from '@/components/intake/new-template-dialog';
import type { IntakeFormTemplate } from '@/lib/types';

export default async function IntakeTemplatesPage() {
  const templates = await callBackend<IntakeFormTemplate[]>('/api/v1/intake-form-templates');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Intake form templates</h1>
          <p className="text-sm text-muted-foreground">{templates.length} templates</p>
        </div>
        <NewTemplateDialog />
      </div>
      <Card>
        <CardContent className="pt-6">
          <TemplatesTable templates={templates} />
        </CardContent>
      </Card>
    </div>
  );
}
