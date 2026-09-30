'use client';

import Link from 'next/link';
import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { HeartPulse } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { resolveCareGap } from '@/lib/actions/care-gaps';
import type { CareGapWorklistItem } from '@/lib/types';

const SEVERITY_VARIANT: Record<string, 'destructive' | 'warning' | 'outline'> = {
  critical: 'destructive',
  warning: 'warning',
  info: 'outline',
};

function describeGap(item: CareGapWorklistItem): string {
  if (item.ruleKey === 'care_gap_hba1c_overdue') {
    const lastValueAt = item.detail.lastValueAt as string | null | undefined;
    return lastValueAt ? `HbA1c last checked ${new Date(lastValueAt).toLocaleDateString()}` : 'No HbA1c on record';
  }
  if (item.ruleKey === 'care_gap_wellness_visit_overdue') {
    const lastEncounterAt = item.detail.lastEncounterAt as string | null | undefined;
    return lastEncounterAt ? `Last visit ${new Date(lastEncounterAt).toLocaleDateString()}` : 'No completed visit on record';
  }
  return item.title;
}

/**
 * Item 2 (Epic-parity population health) reuses item 26's `useOptimistic` pattern (same repo, same
 * session) for the same reason `TasksTable` needed it: resolving one patient's gap shouldn't
 * disable or delay feedback on every other row in the worklist.
 */
export function CareGapsTable({ items }: { items: CareGapWorklistItem[] }) {
  const [, startTransition] = useTransition();
  const [optimisticItems, removeItem] = useOptimistic(items, (state, id: string) => state.filter((item) => item.id !== id));

  if (optimisticItems.length === 0) {
    return <EmptyState icon={HeartPulse} message="No open care gaps — nothing to review right now." />;
  }

  function onResolve(id: string) {
    startTransition(async () => {
      removeItem(id);
      const result = await resolveCareGap(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Patient</TableHead>
          <TableHead>Gap</TableHead>
          <TableHead>Detail</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Opened</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {optimisticItems.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">
              {item.patientId ? (
                <Link href={`/patients/${item.patientId}`} className="text-primary hover:underline">
                  {item.patientName ?? 'View chart'}
                </Link>
              ) : (
                item.patientName ?? '—'
              )}
            </TableCell>
            <TableCell>{item.title}</TableCell>
            <TableCell className="text-muted-foreground">{describeGap(item)}</TableCell>
            <TableCell>
              <Badge variant={SEVERITY_VARIANT[item.severity] ?? 'outline'}>{item.severity}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{new Date(item.openedAt).toLocaleDateString()}</TableCell>
            <TableCell>
              <Button size="sm" variant="outline" onClick={() => onResolve(item.id)}>
                Resolve
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
