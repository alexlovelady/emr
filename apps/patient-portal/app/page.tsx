import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callBackend, SessionExpiredError } from '@/lib/api-proxy';
import type { PortalAccessiblePatient } from '@/lib/types';

export default async function RootPage() {
  let patients: PortalAccessiblePatient[];
  try {
    patients = await callBackend<PortalAccessiblePatient[]>('/api/v1/portal/patients');
  } catch (err) {
    if (err instanceof SessionExpiredError) redirect('/login');
    throw err;
  }

  if (patients.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">No patient records are linked to this account yet.</p>
          <p className="text-sm text-muted-foreground">
            Ask your practice to add you as a proxy, or{' '}
            <Link href="/login" className="text-primary hover:underline">
              sign in with a different account
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  redirect(`/patients/${patients[0]!.patientId}`);
}
