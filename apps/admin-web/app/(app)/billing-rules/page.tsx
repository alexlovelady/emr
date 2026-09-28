import { Scale } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { NewBillingRuleDialog } from '@/components/billing-rules/new-billing-rule-dialog';
import { ToggleRuleStatusButton } from '@/components/billing-rules/toggle-rule-status-button';
import type { BillingRuleRow } from '@/lib/types';

const RULE_TYPE_LABELS: Record<string, string> = {
  code_requires_diagnosis_prefix: 'Requires diagnosis prefix',
  code_forbidden_for_sex: 'Forbidden for sex',
  code_max_units: 'Max units',
};

function parametersSummary(rule: BillingRuleRow): string {
  const p = rule.parameters as Record<string, unknown>;
  if (rule.ruleType === 'code_requires_diagnosis_prefix') return `dx starts with ${String(p.diagnosisPrefix)}`;
  if (rule.ruleType === 'code_forbidden_for_sex') return `sex = ${String(p.sex)}`;
  if (rule.ruleType === 'code_max_units') return `max ${String(p.maxUnits)} unit(s)`;
  return JSON.stringify(p);
}

export default async function BillingRulesPage() {
  const rules = await callBackend<BillingRuleRow[]>('/api/v1/billing-rules');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing rules</h1>
          <p className="text-sm text-muted-foreground">
            {rules.length} rule(s) — enforced when a coder finalizes coding on a charge with a matching code.
          </p>
        </div>
        <NewBillingRuleDialog />
      </div>
      <Card>
        <CardContent className="pt-6">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Scale className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No billing rules yet — all coding validation is the built-in default today.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Parameters</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell>{String((r.parameters as Record<string, unknown>).code)}</TableCell>
                    <TableCell className="text-muted-foreground">{parametersSummary(r)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'active' ? 'success' : 'outline'}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ToggleRuleStatusButton id={r.id} status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
