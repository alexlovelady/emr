import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Patient } from '@/lib/types';

function age(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) years -= 1;
  return years;
}

export function DemographicsHeader({ patient }: { patient: Patient }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {patient.familyName}, {patient.givenName}
        </h1>
        <span className="text-sm text-muted-foreground">
          {age(patient.dateOfBirth)} yo · {patient.sexAtBirth ?? 'unspecified'} · DOB {patient.dateOfBirth}
        </span>
        {patient.phone && <span className="text-sm text-muted-foreground">{patient.phone}</span>}
        <Badge variant={patient.status === 'active' ? 'success' : 'outline'}>{patient.status}</Badge>
      </CardContent>
    </Card>
  );
}
