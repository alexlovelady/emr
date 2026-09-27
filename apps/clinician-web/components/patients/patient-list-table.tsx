import Link from 'next/link';
import { Users } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import type { Patient } from '@/lib/types';

function initials(givenName: string, familyName: string): string {
  return `${givenName[0] ?? ''}${familyName[0] ?? ''}`.toUpperCase();
}

export function PatientListTable({ patients }: { patients: Patient[] }) {
  if (patients.length === 0) {
    return <EmptyState icon={Users} message="No patients match your search." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Date of birth</TableHead>
          <TableHead>Sex</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {patients.map((patient) => (
          <TableRow key={patient.id}>
            <TableCell>
              <Link href={`/patients/${patient.id}`} className="group flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {initials(patient.givenName, patient.familyName)}
                </div>
                <span className="font-medium text-foreground group-hover:text-primary group-hover:underline">
                  {patient.familyName}, {patient.givenName}
                </span>
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{patient.dateOfBirth}</TableCell>
            <TableCell className="text-muted-foreground">{patient.sexAtBirth ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{patient.phone ?? '—'}</TableCell>
            <TableCell>
              <Badge variant={patient.status === 'active' ? 'success' : 'outline'}>{patient.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
