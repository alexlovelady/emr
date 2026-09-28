import { Landmark } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ImportStatementDialog } from '@/components/bank-reconciliation/import-statement-dialog';
import { AutoMatchButton } from '@/components/bank-reconciliation/auto-match-button';
import { MatchDepositDialog, IgnoreDepositDialog } from '@/components/bank-reconciliation/deposit-actions';
import type { BankDepositRow } from '@/lib/types';

export default async function BankReconciliationPage() {
  const deposits = await callBackend<BankDepositRow[]>('/api/v1/bank-deposits/unmatched');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            {deposits.length} unmatched deposit(s) — no live bank-feed connection, file-based import only.
          </p>
        </div>
        <div className="flex gap-2">
          <AutoMatchButton />
          <ImportStatementDialog />
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          {deposits.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Landmark className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No unmatched deposits — import a statement to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{new Date(d.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell>{d.accountNumber}</TableCell>
                    <TableCell className="text-muted-foreground">{d.bankReferenceNumber ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{d.description ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">${d.amount}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <MatchDepositDialog depositId={d.id} />
                      <IgnoreDepositDialog depositId={d.id} />
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
