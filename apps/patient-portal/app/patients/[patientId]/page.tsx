import { callBackend, callBackendOr } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EditContactForm } from '@/components/profile/edit-contact-form';
import type { Allergy, MedicationItem, Patient, Problem } from '@/lib/types';

export default async function PatientOverviewPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [patient, problems, allergies, medications] = await Promise.all([
    callBackend<Patient>(`/api/v1/portal/patients/${patientId}/profile`),
    callBackendOr<Problem[]>(`/api/v1/portal/patients/${patientId}/problems`, []),
    callBackendOr<Allergy[]>(`/api/v1/portal/patients/${patientId}/allergies`, []),
    callBackendOr<MedicationItem[]>(`/api/v1/portal/patients/${patientId}/medications`, []),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{problems.length}</div>
            <p className="text-xs text-muted-foreground">Active problems</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{allergies.length}</div>
            <p className="text-xs text-muted-foreground">Allergies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-semibold">{medications.length}</div>
            <p className="text-xs text-muted-foreground">Active medications</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact info</CardTitle>
        </CardHeader>
        <CardContent>
          <EditContactForm patient={patient} />
        </CardContent>
      </Card>
    </div>
  );
}
