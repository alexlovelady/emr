import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { callBackend, SessionExpiredError } from '@/lib/api-proxy';
import { PortalNav } from '@/components/nav/portal-nav';
import { PatientSwitcher } from '@/components/nav/patient-switcher';
import type { PortalAccessiblePatient } from '@/lib/types';

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  let patients: PortalAccessiblePatient[];
  try {
    patients = await callBackend<PortalAccessiblePatient[]>('/api/v1/portal/patients');
  } catch (err) {
    if (err instanceof SessionExpiredError) redirect('/login');
    throw err;
  }

  const current = patients.find((p) => p.patientId === patientId);
  if (!current) redirect('/');

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {current.patient.givenName} {current.patient.familyName}
          </h1>
          <p className="text-sm text-muted-foreground">DOB {current.patient.dateOfBirth}</p>
        </div>
        <PatientSwitcher patients={patients} currentPatientId={patientId} />
      </div>
      <PortalNav patientId={patientId} />
      <div className="mt-6">{children}</div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
