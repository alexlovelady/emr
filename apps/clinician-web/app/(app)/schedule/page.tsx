import { callBackend, callBackendOr } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { TodayScheduleTable } from '@/components/schedule/today-schedule-table';
import { NewAppointmentDialog } from '@/components/schedule/new-appointment-dialog';
import type { Appointment, Location, Patient, Resource } from '@/lib/types';

function todayUtcRange(): { scheduledFrom: string; scheduledTo: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { scheduledFrom: start.toISOString(), scheduledTo: end.toISOString() };
}

export default async function SchedulePage() {
  const { scheduledFrom, scheduledTo } = todayUtcRange();
  const [appointments, allPatients, resources, locations] = await Promise.all([
    callBackend<Appointment[]>('/api/v1/appointments', { query: { scheduledFrom, scheduledTo } }),
    callBackend<Patient[]>('/api/v1/patients'),
    callBackendOr<Resource[]>('/api/v1/resources', []),
    // Location.manage is a narrower permission than most scheduling staff hold — degrade to an
    // empty list (the dialog falls back to a raw location-ID field) rather than 403 the whole page.
    callBackendOr<Location[]>('/api/v1/locations', []),
  ]);

  const uniquePatientIds = [...new Set(appointments.map((a) => a.patientId))];
  const knownPatients = new Map(allPatients.map((p) => [p.id, p]));
  const patientsById = new Map(uniquePatientIds.map((id) => [id, knownPatients.get(id)]).filter((e): e is [string, Patient] => !!e[1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s schedule</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} &middot;{' '}
            {appointments.length} appointments
          </p>
        </div>
        <NewAppointmentDialog patients={allPatients} resources={resources} locations={locations} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <TodayScheduleTable appointments={appointments} patientsById={patientsById} />
        </CardContent>
      </Card>
    </div>
  );
}
