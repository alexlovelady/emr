import Link from 'next/link';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Appointment, Patient } from '@/lib/types';

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TodayScheduleTable({ appointments, patientsById }: { appointments: Appointment[]; patientsById: Map<string, Patient> }) {
  if (appointments.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No appointments scheduled for today.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Practitioner</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appt) => {
          const patient = patientsById.get(appt.patientId);
          return (
            <TableRow key={appt.id}>
              <TableCell>
                {timeOfDay(appt.scheduledStart)}–{timeOfDay(appt.scheduledEnd)}
              </TableCell>
              <TableCell>
                {patient ? (
                  <Link href={`/patients/${patient.id}`} className="font-medium text-primary hover:underline">
                    {patient.familyName}, {patient.givenName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unknown patient</span>
                )}
              </TableCell>
              <TableCell>{appt.appointmentType}</TableCell>
              {/* GET /practitioners requires PRACTITIONER_MANAGE — deferred, see README known trims */}
              <TableCell className="font-mono text-xs text-muted-foreground">{appt.practitionerId.slice(0, 8)}…</TableCell>
              <TableCell>
                <Badge variant={appt.status === 'checked_in' ? 'success' : 'outline'}>{appt.status}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
