import { AlertTriangle, Cake, Phone, VenusAndMars } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FindDuplicatesDialog } from '@/components/chart/find-duplicates-dialog';
import { AiChartQaDialog } from '@/components/chart/ai-chart-qa-dialog';
import type { Allergy, Patient } from '@/lib/types';

function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) years -= 1;
  return years;
}

function initials(givenName: string, familyName: string): string {
  return `${givenName[0] ?? ''}${familyName[0] ?? ''}`.toUpperCase();
}

export function PatientBanner({ patient, allergies }: { patient: Patient; allergies: Allergy[] }) {
  const activeAllergies = allergies.filter((a) => a.status !== 'deleted');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground">
          {initials(patient.givenName, patient.familyName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {patient.familyName}, {patient.givenName}
            </h1>
            <Badge variant={patient.status === 'active' ? 'success' : 'outline'}>{patient.status}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Cake className="h-3.5 w-3.5" /> {age(patient.dateOfBirth)} yo &middot; DOB {patient.dateOfBirth}
            </span>
            <span className="flex items-center gap-1.5">
              <VenusAndMars className="h-3.5 w-3.5" /> {patient.sexAtBirth ?? 'Unspecified'}
            </span>
            {patient.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {patient.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <AiChartQaDialog patientId={patient.id} />
          <FindDuplicatesDialog patient={patient} />
        </div>
      </div>

      {activeAllergies.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" strokeWidth={2.5} />
          <div className="text-sm">
            <span className="font-semibold text-destructive">Allergies: </span>
            <span className="text-foreground">
              {activeAllergies.map((a) => a.substance).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
