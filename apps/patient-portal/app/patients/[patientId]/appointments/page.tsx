import { CalendarDays, Video } from 'lucide-react';
import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookAppointmentForm } from '@/components/appointments/book-appointment-form';
import { CancelAppointmentButton } from '@/components/appointments/cancel-appointment-button';
import type { Appointment, BookableLocation, BookablePractitioner } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive' | 'warning'> = {
  scheduled: 'outline',
  confirmed: 'success',
  checked_in: 'success',
  cancelled: 'destructive',
  no_show: 'destructive',
};

const CANCELLABLE_STATUSES = new Set(['scheduled', 'confirmed']);

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
                <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.appointmentType}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.scheduledStart).toLocaleString()} – {new Date(a.scheduledEnd).toLocaleTimeString()}
                    </div>
                    {a.visitType === 'telehealth' && a.videoJoinUrlPatient && (
                      <a
                        href={a.videoJoinUrlPatient}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <Video className="h-3 w-3" /> Join video visit
                      </a>
                    )}
                  </div>
                  <Badge variant={STATUS_VARIANT[a.status] ?? 'outline'}>{a.status.replace(/_/g, ' ')}</Badge>
                  {CANCELLABLE_STATUSES.has(a.status) && <CancelAppointmentButton patientId={patientId} appointmentId={a.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
