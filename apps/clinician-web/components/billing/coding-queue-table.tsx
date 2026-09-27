import { ClipboardList } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/chart/empty-state';
import { FinalizeCodingDialog } from '@/components/billing/finalize-coding-dialog';
import type { Charge } from '@/lib/types';

export function CodingQueueTable({ charges }: { charges: Charge[] }) {
  if (charges.length === 0) {
    return <EmptyState icon={ClipboardList} message="Nothing waiting for coding." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Diagnosis codes</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {charges.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">
              {c.codeSystem}:{c.code}
            </TableCell>
            <TableCell>{c.description}</TableCell>
            <TableCell className="text-muted-foreground">{c.diagnosisCodes.join(', ') || '—'}</TableCell>
            <TableCell className="text-muted-foreground">${(Number(c.unitPrice) * c.units).toFixed(2)}</TableCell>
            <TableCell>
              <FinalizeCodingDialog charge={c} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
