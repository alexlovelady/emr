'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { reviewDiagnosticReport } from '@/lib/actions/results';
import type { DiagnosticReport, Patient } from '@/lib/types';

export function ResultsInboxTable({ reports, patientsById }: { reports: DiagnosticReport[]; patientsById: Map<string, Patient> }) {
  const [isPending, startTransition] = useTransition();

  function onReview(id: string, patientId: string, reviewStatus: 'reviewed' | 'acknowledged') {
    startTransition(async () => {
      const result = await reviewDiagnosticReport(id, patientId, reviewStatus);
      if (!result.ok) toast.error(result.error);
    });
  }

  if (reports.length === 0) {
    return <EmptyState icon={Inbox} message="Nothing waiting for review." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Report</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((r) => {
          const patient = patientsById.get(r.patientId);
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.displayName}</TableCell>
              <TableCell>
                {patient ? (
                  <Link href={`/patients/${patient.id}`} className="text-primary hover:underline">
                    {patient.familyName}, {patient.givenName}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{new Date(r.issuedAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  {r.criticalFlag && <Badge variant="destructive">critical</Badge>}
                  {r.abnormalFlag && !r.criticalFlag && <Badge variant="warning">abnormal</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{r.reviewStatus}</Badge>
              </TableCell>
              <TableCell>
                {r.reviewStatus === 'pending' && (
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => onReview(r.id, r.patientId, 'reviewed')}>
                    Mark reviewed
                  </Button>
                )}
                {r.reviewStatus === 'reviewed' && (
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onReview(r.id, r.patientId, 'acknowledged')}>
                    Acknowledge
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
