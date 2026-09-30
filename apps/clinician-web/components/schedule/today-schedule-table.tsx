import Link from 'next/link';
import { CalendarDays, MessageSquareText, Stethoscope, Video } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { AppointmentRowActions } from '@/components/schedule/appointment-row-actions';
import type { Appointment, Patient } from '@/lib/types';

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'destructive'> = {
  checked_in: 'success',
  scheduled: 'outline',
  confirmed: 'outline',
  cancelled: 'destructive',
  no_show: 'destructive',
  waitlisted: 'warning',
};

export function TodayScheduleTable({
  appointments,
  patientsById,
  practitionerNameById,
}: {
  appointments: Appointment[];
  patientsById: Map<string, Patient>;
  practitionerNameById: Map<string, string>;
}) {
  if (appointments.length === 0) {
    return <EmptyState icon={CalendarDays} message="No appointments scheduled for today." />;
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
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appt) => {
          const patient = patientsById.get(appt.patientId);
          return (
            <TableRow key={appt.id}>
              <TableCell className="font-medium tabular-nums">
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
              <TableCell className="text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" /> {appt.appointmentType.replace(/_/g, ' ')}
                </span>
                {appt.visitType === 'telehealth' && appt.videoJoinUrlPractitioner && (
                  <a
                    href={appt.videoJoinUrlPractitioner}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Video className="h-3 w-3" /> Join video visit
                  </a>
                )}
                {appt.patientAgenda && (
                  <span className="mt-0.5 flex items-start gap-1.5 text-xs italic" title={appt.patientAgenda}>
                    <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">{appt.patientAgenda}</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{practitionerNameById.get(appt.practitionerId) ?? 'Unknown practitioner'}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[appt.status] ?? 'outline'}>{appt.status.replace(/_/g, ' ')}</Badge>
              </TableCell>
              <TableCell>
                <AppointmentRowActions appointment={appt} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
