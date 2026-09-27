import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { TodayScheduleTable } from '@/components/schedule/today-schedule-table';
import type { Appointment, Patient } from '@/lib/types';

function todayUtcRange(): { scheduledFrom: string; scheduledTo: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { scheduledFrom: start.toISOString(), scheduledTo: end.toISOString() };
}

export default async function SchedulePage() {
  const { scheduledFrom, scheduledTo } = todayUtcRange();
  const appointments = await callBackend<Appointment[]>('/api/v1/appointments', { query: { scheduledFrom, scheduledTo } });

  const uniquePatientIds = [...new Set(appointments.map((a) => a.patientId))];
  const patients = await Promise.all(uniquePatientIds.map((id) => callBackend<Patient>(`/api/v1/patients/${id}`)));
  const patientsById = new Map(patients.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s schedule</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} &middot;{' '}
          {appointments.length} appointments
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <TodayScheduleTable appointments={appointments} patientsById={patientsById} />
        </CardContent>
      </Card>
    </div>
  );
}
