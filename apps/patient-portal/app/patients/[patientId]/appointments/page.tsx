import { CalendarDays } from 'lucide-react';
import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { BookAppointmentForm } from '@/components/appointments/book-appointment-form';
import { AppointmentRow } from '@/components/appointments/appointment-row';
import type { Appointment, BookableLocation, BookablePractitioner } from '@/lib/types';

export default async function AppointmentsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [appointments, practitioners, locations] = await Promise.all([
    callBackendOr<Appointment[]>(`/api/v1/portal/patients/${patientId}/appointments`, []),
    callBackendOr<BookablePractitioner[]>('/api/v1/portal/practitioners', []),
    callBackendOr<BookableLocation[]>('/api/v1/portal/locations', []),
  ]);
  const sorted = [...appointments].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));

  return (
    <div className="space-y-4">
      <BookAppointmentForm patientId={patientId} practitioners={practitioners} locations={locations} />
      <Card>
        <CardContent className="pt-6">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarDays className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No appointments on file.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((a) => (
                <AppointmentRow key={a.id} patientId={patientId} appointment={a} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
