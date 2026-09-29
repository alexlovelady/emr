'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Pill } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { DenyRefillDialog } from '@/components/medications/deny-refill-dialog';
import { approveRefill } from '@/lib/actions/prescriptions';
import type { Patient, PendingRefillRequest } from '@/lib/types';

export function RefillRequestsTable({ requests, patientsById }: { requests: PendingRefillRequest[]; patientsById: Map<string, Patient> }) {
  const [isPending, startTransition] = useTransition();

  function onApprove(id: string, patientId: string) {
    startTransition(async () => {
      const result = await approveRefill(id, patientId);
      if (!result.ok) toast.error(result.error);
    });
  }

  if (requests.length === 0) {
    return <EmptyState icon={Pill} message="No refill requests are waiting for a decision." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Medication</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Pharmacy</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((r) => {
          const patient = patientsById.get(r.patientId);
          return (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.medicationName}</TableCell>
              <TableCell>
                {patient ? (
                  <Link href={`/patients/${patient.id}`} className="text-primary hover:underline">
                    {patient.familyName}, {patient.givenName}
                  </Link>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.pharmacyName}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(r.requestedAt).toLocaleString()}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => onApprove(r.id, r.patientId)}>
                    Approve
                  </Button>
                  <DenyRefillDialog requestId={r.id} patientId={r.patientId} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
