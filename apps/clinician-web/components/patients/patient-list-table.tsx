import Link from 'next/link';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Patient } from '@/lib/types';

export function PatientListTable({ patients }: { patients: Patient[] }) {
  if (patients.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No patients match your search.</p>;
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
              <Link href={`/patients/${patient.id}`} className="font-medium text-primary hover:underline">
                {patient.familyName}, {patient.givenName}
              </Link>
            </TableCell>
            <TableCell>{patient.dateOfBirth}</TableCell>
            <TableCell>{patient.sexAtBirth ?? '—'}</TableCell>
            <TableCell>{patient.phone ?? '—'}</TableCell>
            <TableCell>
              <Badge variant={patient.status === 'active' ? 'success' : 'outline'}>{patient.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
